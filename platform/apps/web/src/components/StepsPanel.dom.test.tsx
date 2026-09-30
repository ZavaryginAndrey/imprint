// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithStore, snapshot, task } from "../test/harness";
import { DayColumn } from "./DayColumn";
import { Toasts } from "./Toasts";

afterEach(cleanup);

const snap = snapshot({ tasks: [task({ id: "t1", title: "Покупки" })] });
const row = () => screen.getByText("Покупки").closest("[data-row]") as HTMLElement;
const openSteps = async () => {
  fireEvent.click(within(row()).getByRole("button", { name: "Шаги" }));
  return (await screen.findAllByRole("textbox", { name: "Новый шаг" }))[0];
};
const typeStep = (field: HTMLElement, text: string) => {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: "Enter" });
};

describe("steps (UX §4)", () => {
  it("Enter adds the step; the window stays open with an empty field; the row counts them", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    typeStep(await openSteps(), "Список");
    expect(screen.getByText("Список")).toBeTruthy();
    expect((screen.getAllByRole("textbox", { name: "Новый шаг" })[0] as HTMLInputElement).value).toBe("");
    expect(within(row()).getByLabelText("Шаги: 0 из 1")).toBeTruthy();
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "add_steps", input: { taskId: "t1", steps: ["Список"] } });
  });

  it("ticking the last open step closes the task; unticking reopens it; the window stays", async () => {
    const { store } = await renderWithStore(<DayColumn />, snap);
    const field = await openSteps();
    typeStep(field, "Раз");
    typeStep(screen.getAllByRole("textbox", { name: "Новый шаг" })[0], "Два");
    fireEvent.click(screen.getByRole("button", { name: "Отметить: Раз" }));
    expect(store.getState().view?.day[0].doneToday).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Отметить: Два" }));
    expect(store.getState().view?.day[0].doneToday).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Вернуть: Раз" }));
    expect(store.getState().view?.day[0].doneToday).toBe(false);
    expect(screen.getAllByRole("textbox", { name: "Новый шаг" })).toBeTruthy();
  });

  it("«Подсказать шаги» fills fields; «Разбить» adds them all", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    await openSteps();
    fireEvent.click(screen.getByRole("button", { name: /Подсказать шаги/ }));
    await act(async () => {});
    expect(calls[0]).toMatchObject({ name: "suggest_steps", input: { taskId: "t1" }, ids: [] });
    await act(async () => calls[0].resolve({ kind: "done", result: { ok: true, changed: false, steps: ["А", "Б"], remaining: 3 }, rev: 1 }));
    const values = screen.getAllByRole("textbox", { name: "Новый шаг" }).map((f) => (f as HTMLInputElement).value);
    expect(values).toEqual(["А", "Б"]);
    fireEvent.click(screen.getByRole("button", { name: "Разбить" }));
    await act(async () => {});
    expect(calls[1]).toMatchObject({ name: "add_steps", input: { taskId: "t1", steps: ["А", "Б"] } });
  });

  it.each([
    [{ kind: "done", result: { ok: false, error: "unavailable" }, rev: -1 }, "Подсказки сейчас недоступны"],
    [{ kind: "done", result: { ok: true, changed: false, reason: "quota", remaining: 0 }, rev: 1 }, "Подсказки на сегодня закончились"],
    [{ kind: "network" }, "Не получилось подсказать"],
  ] as const)("a failed suggestion is a quiet note; typed fields stay; no toast, no queue (%#)", async (answer, note) => {
    const { store, calls } = await renderWithStore(
      <>
        <DayColumn />
        <Toasts />
      </>,
      snap,
    );
    const field = await openSteps();
    fireEvent.change(field, { target: { value: "Моё" } });
    fireEvent.click(screen.getByRole("button", { name: /Подсказать шаги/ }));
    await act(async () => {});
    await act(async () => calls[0].resolve(answer as never));
    expect(screen.getByText(note)).toBeTruthy();
    expect((screen.getAllByRole("textbox", { name: "Новый шаг" })[0] as HTMLInputElement).value).toBe("Моё");
    expect(store.getState().toasts).toHaveLength(0);
    expect(store.getState().pending).toBe(0);
  });

  it("«Разбить» with only blank fields sends nothing", async () => {
    const { calls } = await renderWithStore(<DayColumn />, snap);
    const field = await openSteps();
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Разбить" }));
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });
});
