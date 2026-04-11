import { describe, it, expect, vi, beforeEach } from "vitest";
import { gpuMonitor } from "./gpu-monitor";

/** Minimal mock of THREE.WebGLRenderTarget */
function mockTarget() {
  return { dispose: vi.fn() } as unknown as import("three").WebGLRenderTarget;
}

describe("gpuMonitor", () => {
  beforeEach(() => {
    // Start each test with a clean slate
    gpuMonitor.disposeAll();
  });

  it("tracks and counts render targets", () => {
    const t1 = mockTarget();
    const t2 = mockTarget();

    gpuMonitor.trackRenderTarget(t1, "t1");
    expect(gpuMonitor.getActiveCount()).toBe(1);

    gpuMonitor.trackRenderTarget(t2, "t2");
    expect(gpuMonitor.getActiveCount()).toBe(2);
  });

  it("untracks a render target", () => {
    const t1 = mockTarget();
    gpuMonitor.trackRenderTarget(t1, "t1");
    expect(gpuMonitor.getActiveCount()).toBe(1);

    gpuMonitor.untrackRenderTarget(t1);
    expect(gpuMonitor.getActiveCount()).toBe(0);
  });

  it("double-untrack is safe (no error)", () => {
    const t1 = mockTarget();
    gpuMonitor.trackRenderTarget(t1, "t1");
    gpuMonitor.untrackRenderTarget(t1);
    gpuMonitor.untrackRenderTarget(t1); // second call — should not throw
    expect(gpuMonitor.getActiveCount()).toBe(0);
  });

  it("disposeAll calls dispose() on all tracked targets", () => {
    const t1 = mockTarget();
    const t2 = mockTarget();
    const t3 = mockTarget();

    gpuMonitor.trackRenderTarget(t1, "t1");
    gpuMonitor.trackRenderTarget(t2, "t2");
    gpuMonitor.trackRenderTarget(t3, "t3");

    gpuMonitor.disposeAll();

    expect(t1.dispose).toHaveBeenCalledOnce();
    expect(t2.dispose).toHaveBeenCalledOnce();
    expect(t3.dispose).toHaveBeenCalledOnce();
    expect(gpuMonitor.getActiveCount()).toBe(0);
  });

  it("disposeAll handles a target whose dispose() throws", () => {
    const good = mockTarget();
    const bad = mockTarget();
    (bad.dispose as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("GL context lost");
    });

    gpuMonitor.trackRenderTarget(good, "good");
    gpuMonitor.trackRenderTarget(bad, "bad");

    // Should not throw despite bad target
    expect(() => gpuMonitor.disposeAll()).not.toThrow();
    expect(good.dispose).toHaveBeenCalledOnce();
    expect(gpuMonitor.getActiveCount()).toBe(0);
  });

  it("re-tracking the same target updates its label", () => {
    const t1 = mockTarget();
    gpuMonitor.trackRenderTarget(t1, "label-a");
    gpuMonitor.trackRenderTarget(t1, "label-b");
    // Still only counted once
    expect(gpuMonitor.getActiveCount()).toBe(1);
  });
});
