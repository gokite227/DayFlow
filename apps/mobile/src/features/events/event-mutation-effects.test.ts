import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api-error";
import { eventMutationCallbacks } from "./event-mutation-effects";

function fakes() {
  const calls: string[] = [];
  const deps = {
    invalidateEvents: vi.fn(async () => {
      calls.push("invalidate");
    }),
    reconcileReminders: vi.fn(async () => {
      calls.push("reconcile");
    }),
  };
  return { calls, deps };
}

describe("Event mutation → notification reconcile", () => {
  it("reconciles notifications after a successful server mutation", async () => {
    const { calls, deps } = fakes();
    await eventMutationCallbacks(deps).onSuccess();
    expect(calls).toEqual(["invalidate", "reconcile"]);
    expect(deps.reconcileReminders).toHaveBeenCalledWith("event-mutation");
  });

  it("does not touch notifications when the server rejected the change", () => {
    const { deps } = fakes();
    const callbacks = eventMutationCallbacks(deps);
    callbacks.onError(new ApiError(400, undefined));
    callbacks.onError(new TypeError("Network request failed"));
    expect(deps.reconcileReminders).not.toHaveBeenCalled();
    expect(deps.invalidateEvents).not.toHaveBeenCalled();
  });

  it("only refetches after a version conflict", () => {
    const { deps } = fakes();
    eventMutationCallbacks(deps).onError(new ApiError(409, undefined));
    expect(deps.invalidateEvents).toHaveBeenCalledTimes(1);
    expect(deps.reconcileReminders).not.toHaveBeenCalled();
  });

  it("does not fail the mutation when reconcile fails", async () => {
    const { deps } = fakes();
    deps.reconcileReminders.mockRejectedValueOnce(new Error("offline"));
    await expect(eventMutationCallbacks(deps).onSuccess()).resolves.toBeUndefined();
  });
});