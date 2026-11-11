import { z } from "zod";
import { hfWrite } from "../client.js";

// Инструменты записи (изменяют данные в Huntflow). Тела запросов сверены с OpenAPI-спекой
// https://api.huntflow.ru/v2/openapi.json. Удаление намеренно не реализовано.
// Отключаются целиком переменной HUNTFLOW_READ_ONLY=1.

const accountId = z.coerce.number().describe("ID аккаунта HuntFlow");
const applicantId = z.coerce.number().describe("ID кандидата");
const vacancyId = z.coerce.number().describe("ID вакансии");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ожидается дата в формате YYYY-MM-DD")
  .describe("Дата в формате YYYY-MM-DD");

/** Убирает undefined-поля, чтобы не затирать значения, которые модель не передавала. */
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function requireChanges(body: Record<string, unknown>): void {
  if (Object.keys(body).length === 0) {
    throw new Error("Не передано ни одного поля для изменения.");
  }
}

// --- Кандидаты ---
const applicantFields = {
  first_name: z.string().optional().describe("Имя"),
  last_name: z.string().optional().describe("Фамилия"),
  middle_name: z.string().optional().describe("Отчество"),
  phone: z.string().optional().describe("Телефон"),
  email: z.string().email().optional().describe("Email"),
  position: z.string().optional().describe("Должность (род занятий) кандидата"),
  company: z.string().optional().describe("Текущее место работы"),
  money: z.string().optional().describe("Зарплатные ожидания (строкой)"),
  birthday: isoDate.optional().describe("Дата рождения, YYYY-MM-DD"),
};

export const createApplicantSchema = z.object({ account_id: accountId, ...applicantFields });

export async function handleCreateApplicant(
  params: z.infer<typeof createApplicantSchema>,
): Promise<unknown> {
  const { account_id, ...fields } = params;
  const body = compact(fields);
  if (!body.first_name && !body.last_name) {
    throw new Error("Укажите хотя бы first_name или last_name.");
  }
  return hfWrite("POST", `/accounts/${account_id}/applicants`, body);
}

export const updateApplicantSchema = z.object({
  account_id: accountId,
  applicant_id: applicantId,
  ...applicantFields,
});

export async function handleUpdateApplicant(
  params: z.infer<typeof updateApplicantSchema>,
): Promise<unknown> {
  const { account_id, applicant_id, ...fields } = params;
  const body = compact(fields);
  requireChanges(body);
  return hfWrite("PATCH", `/accounts/${account_id}/applicants/${applicant_id}`, body);
}

// --- Кандидат ↔ вакансия ---
const applicantVacancyFields = {
  account_id: accountId,
  applicant_id: applicantId,
  vacancy_id: vacancyId,
  status_id: z.coerce.number().describe("ID этапа подбора (см. list_stages)"),
  comment: z.string().max(65535).optional().describe("Комментарий"),
  rejection_reason_id: z.coerce
    .number()
    .optional()
    .describe("ID причины отказа (см. list_rejection_reasons) — для этапа «отказ»"),
  employment_date: isoDate.optional().describe("Дата выхода на работу — для этапа «принят»"),
  fill_quota_id: z.coerce.number().optional().describe("ID квоты — для этапа «принят»"),
};

const applicantVacancySchema = z.object(applicantVacancyFields);
export const addApplicantToVacancySchema = applicantVacancySchema;
export const changeApplicantStatusSchema = applicantVacancySchema;

function applicantVacancyBody(p: z.infer<typeof applicantVacancySchema>): Record<string, unknown> {
  return compact({
    vacancy: p.vacancy_id,
    status: p.status_id,
    comment: p.comment,
    rejection_reason: p.rejection_reason_id,
    employment_date: p.employment_date,
    fill_quota: p.fill_quota_id,
  });
}

export async function handleAddApplicantToVacancy(
  params: z.infer<typeof addApplicantToVacancySchema>,
): Promise<unknown> {
  return hfWrite(
    "POST",
    `/accounts/${params.account_id}/applicants/${params.applicant_id}/vacancy`,
    applicantVacancyBody(params),
  );
}

export async function handleChangeApplicantStatus(
  params: z.infer<typeof changeApplicantStatusSchema>,
): Promise<unknown> {
  return hfWrite(
    "PUT",
    `/accounts/${params.account_id}/applicants/${params.applicant_id}/vacancy`,
    applicantVacancyBody(params),
  );
}

// --- Комментарий и теги ---
export const addApplicantCommentSchema = z.object({
  account_id: accountId,
  applicant_id: applicantId,
  comment: z.string().min(1).max(65535).describe("Текст комментария"),
  vacancy_id: z.coerce
    .number()
    .optional()
    .describe("ID вакансии; без него комментарий будет личной заметкой по кандидату"),
});

export async function handleAddApplicantComment(
  params: z.infer<typeof addApplicantCommentSchema>,
): Promise<unknown> {
  return hfWrite(
    "POST",
    `/accounts/${params.account_id}/applicants/${params.applicant_id}/logs`,
    compact({ comment: params.comment, vacancy: params.vacancy_id }),
  );
}

export const setApplicantTagsSchema = z.object({
  account_id: accountId,
  applicant_id: applicantId,
  tag_ids: z
    .array(z.coerce.number())
    .describe("Полный список ID тегов (см. list_tags). Заменяет текущие теги; [] — снять все"),
});

export async function handleSetApplicantTags(
  params: z.infer<typeof setApplicantTagsSchema>,
): Promise<unknown> {
  return hfWrite("POST", `/accounts/${params.account_id}/applicants/${params.applicant_id}/tags`, {
    tags: params.tag_ids,
  });
}

// --- Вакансии ---
const vacancyFields = {
  company: z.string().optional().describe("Отдел (игнорируется, если включены подразделения)"),
  money: z.string().optional().describe("Зарплата (строкой)"),
  priority: z.coerce.number().int().min(0).max(1).optional().describe("0 — обычный, 1 — высокий"),
  hidden: z.boolean().optional().describe("Скрыть вакансию от коллег"),
  body: z.string().optional().describe("Обязанности (HTML)"),
  requirements: z.string().optional().describe("Требования (HTML)"),
  conditions: z.string().optional().describe("Условия (HTML)"),
  account_division: z.coerce.number().optional().describe("ID подразделения (см. list_divisions)"),
  account_region: z.coerce.number().optional().describe("ID региона"),
};

export const createVacancySchema = z.object({
  account_id: accountId,
  position: z.string().min(1).describe("Название вакансии (должность)"),
  ...vacancyFields,
  applicants_to_hire: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("Сколько человек нужно нанять"),
  deadline: isoDate.optional().describe("Срок закрытия вакансии, YYYY-MM-DD"),
});

export async function handleCreateVacancy(
  params: z.infer<typeof createVacancySchema>,
): Promise<unknown> {
  const { account_id, applicants_to_hire, deadline, ...fields } = params;
  return hfWrite("POST", `/accounts/${account_id}/vacancies`, {
    ...compact(fields),
    fill_quotas: [compact({ applicants_to_hire: applicants_to_hire ?? 1, deadline })],
  });
}

export const updateVacancySchema = z.object({
  account_id: accountId,
  vacancy_id: vacancyId,
  position: z.string().min(1).optional().describe("Название вакансии (должность)"),
  ...vacancyFields,
});

export async function handleUpdateVacancy(
  params: z.infer<typeof updateVacancySchema>,
): Promise<unknown> {
  const { account_id, vacancy_id, ...fields } = params;
  const body = compact(fields);
  requireChanges(body);
  return hfWrite("PATCH", `/accounts/${account_id}/vacancies/${vacancy_id}`, body);
}

export const setVacancyStateSchema = z.object({
  account_id: accountId,
  vacancy_id: vacancyId,
  action: z
    .enum(["close", "hold", "resume"])
    .describe("close — закрыть, hold — приостановить, resume — возобновить"),
  comment: z.string().optional().describe("Комментарий (для close/hold)"),
  date: isoDate.optional().describe("Дата действия (для close/hold), YYYY-MM-DD"),
  reason_id: z.coerce.number().optional().describe("ID причины закрытия/приостановки"),
  unpublish_all: z.boolean().optional().describe("Снять вакансию со всех публикаций"),
});

export async function handleSetVacancyState(
  params: z.infer<typeof setVacancyStateSchema>,
): Promise<unknown> {
  const path = `/accounts/${params.account_id}/vacancies/${params.vacancy_id}/state/${params.action}`;
  if (params.action === "resume") return hfWrite("POST", path);
  const reasonKey =
    params.action === "close" ? "account_vacancy_close_reason" : "account_vacancy_hold_reason";
  return hfWrite(
    "POST",
    path,
    compact({
      comment: params.comment,
      date: params.date,
      [reasonKey]: params.reason_id,
      unpublish_all: params.unpublish_all,
    }),
  );
}
