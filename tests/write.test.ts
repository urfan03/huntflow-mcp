import { describe, it, expect, vi, beforeEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

process.env.HUNTFLOW_TOKEN = "test-token";
process.env.HUNTFLOW_TOKEN_FILE = join(tmpdir(), `hf-write-test-${process.pid}.json`);
process.env.HUNTFLOW_DISABLE_RATELIMIT = "1";
process.env.HUNTFLOW_BACKOFF_MS = "0";

import { __resetClientForTests } from "../src/client.js";
import {
  handleCreateApplicant,
  handleUpdateApplicant,
  handleAddApplicantToVacancy,
  handleChangeApplicantStatus,
  handleAddApplicantComment,
  handleSetApplicantTags,
  handleCreateVacancy,
  handleUpdateVacancy,
  handleSetVacancyState,
} from "../src/tools/write.js";

const mockOk = (data: unknown = { id: 1 }) =>
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => data });
const mockErr = (status: number) => ({
  ok: false,
  status,
  statusText: "Error",
  text: async () => JSON.stringify({ errors: [{ type: "err" }] }),
  headers: { get: () => null },
});

const call = (i = 0) => {
  const [url, init] = mockFetch.mock.calls[i] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

beforeEach(() => {
  mockFetch.mockReset();
  __resetClientForTests();
});

describe("кандидаты", () => {
  it("create_applicant: POST /applicants только с переданными полями", async () => {
    mockOk();
    await handleCreateApplicant({ account_id: 7, first_name: "Ali", email: "a@b.co" });
    const c = call();
    expect(c.method).toBe("POST");
    expect(c.url).toMatch(/\/accounts\/7\/applicants$/);
    expect(c.body).toEqual({ first_name: "Ali", email: "a@b.co" });
  });

  it("create_applicant без имени и фамилии не делает запрос", async () => {
    await expect(handleCreateApplicant({ account_id: 7, phone: "1" })).rejects.toThrow(
      /first_name/,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("update_applicant: PATCH и ошибка при пустом наборе полей", async () => {
    mockOk();
    await handleUpdateApplicant({ account_id: 7, applicant_id: 9, money: "5000" });
    const c = call();
    expect(c.method).toBe("PATCH");
    expect(c.url).toMatch(/\/accounts\/7\/applicants\/9$/);
    expect(c.body).toEqual({ money: "5000" });
    await expect(handleUpdateApplicant({ account_id: 7, applicant_id: 9 })).rejects.toThrow(
      /ни одного поля/,
    );
  });
});

describe("кандидат ↔ вакансия", () => {
  it("add_applicant_to_vacancy: POST с vacancy/status", async () => {
    mockOk();
    await handleAddApplicantToVacancy({
      account_id: 1,
      applicant_id: 2,
      vacancy_id: 3,
      status_id: 4,
      comment: "hi",
    });
    const c = call();
    expect(c.method).toBe("POST");
    expect(c.url).toMatch(/\/accounts\/1\/applicants\/2\/vacancy$/);
    expect(c.body).toEqual({ vacancy: 3, status: 4, comment: "hi" });
  });

  it("change_applicant_status: PUT с причиной отказа", async () => {
    mockOk();
    await handleChangeApplicantStatus({
      account_id: 1,
      applicant_id: 2,
      vacancy_id: 3,
      status_id: 5,
      rejection_reason_id: 8,
    });
    const c = call();
    expect(c.method).toBe("PUT");
    expect(c.body).toEqual({ vacancy: 3, status: 5, rejection_reason: 8 });
  });

  it("add_applicant_comment: POST /logs", async () => {
    mockOk();
    await handleAddApplicantComment({ account_id: 1, applicant_id: 2, comment: "note" });
    const c = call();
    expect(c.url).toMatch(/\/applicants\/2\/logs$/);
    expect(c.body).toEqual({ comment: "note" });
  });

  it("set_applicant_tags: POST /tags со списком", async () => {
    mockOk();
    await handleSetApplicantTags({ account_id: 1, applicant_id: 2, tag_ids: [10, 11] });
    const c = call();
    expect(c.url).toMatch(/\/applicants\/2\/tags$/);
    expect(c.body).toEqual({ tags: [10, 11] });
  });
});

describe("вакансии", () => {
  it("create_vacancy: добавляет fill_quotas", async () => {
    mockOk();
    await handleCreateVacancy({ account_id: 1, position: "Dev", applicants_to_hire: 2 });
    const c = call();
    expect(c.method).toBe("POST");
    expect(c.url).toMatch(/\/accounts\/1\/vacancies$/);
    expect(c.body).toEqual({ position: "Dev", fill_quotas: [{ applicants_to_hire: 2 }] });
  });

  it("update_vacancy: PATCH", async () => {
    mockOk();
    await handleUpdateVacancy({ account_id: 1, vacancy_id: 3, money: "100" });
    const c = call();
    expect(c.method).toBe("PATCH");
    expect(c.url).toMatch(/\/vacancies\/3$/);
    expect(c.body).toEqual({ money: "100" });
  });

  it("set_vacancy_state close: причина закрытия и ответ 204 без тела", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("no body");
      },
    });
    const r = await handleSetVacancyState({
      account_id: 1,
      vacancy_id: 3,
      action: "close",
      reason_id: 6,
    });
    const c = call();
    expect(c.url).toMatch(/\/vacancies\/3\/state\/close$/);
    expect(c.body).toEqual({ account_vacancy_close_reason: 6 });
    expect(r).toEqual({ ok: true });
  });

  it("set_vacancy_state hold/resume", async () => {
    mockOk({});
    await handleSetVacancyState({ account_id: 1, vacancy_id: 3, action: "hold", reason_id: 2 });
    expect(call(0).body).toEqual({ account_vacancy_hold_reason: 2 });
    mockOk({});
    await handleSetVacancyState({ account_id: 1, vacancy_id: 3, action: "resume" });
    expect(call(1).url).toMatch(/\/state\/resume$/);
    expect(call(1).body).toBeUndefined();
  });
});

describe("повторы для записи", () => {
  it("POST не повторяется на 5xx (иначе возможен дубль)", async () => {
    mockFetch.mockResolvedValueOnce(mockErr(500));
    await expect(
      handleAddApplicantComment({ account_id: 1, applicant_id: 2, comment: "x" }),
    ).rejects.toThrow(/500/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("POST повторяется на 429", async () => {
    mockFetch.mockResolvedValueOnce(mockErr(429));
    mockOk();
    await handleAddApplicantComment({ account_id: 1, applicant_id: 2, comment: "x" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
