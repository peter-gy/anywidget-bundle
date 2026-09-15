import type { AnyWidgetBundleModel } from "./types";

import { createBundleId } from "./id";
import { isString } from "./guards";

const PROTOCOL_VERSION = 1;

const REQUEST_TYPE = "anywidget-bundle:request";

const RESPONSE_TYPE = "anywidget-bundle:response";

const DEFAULT_TIMEOUT_MS = 30_000;

type PendingRequest = {
  path: string;
  resolve(source: string): void;
  reject(cause: unknown): void;
  timeout: ReturnType<typeof globalThis.setTimeout>;
};

export type ModuleReader = {
  read(path: string): Promise<string>;
  dispose(): void;
};

export type ModuleReaderOptions = {
  timeoutMs?: number;
};

class BundleModuleRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BundleModuleRequestError";
    this.code = code;
  }
}

export function createModuleReader(
  model: AnyWidgetBundleModel,
  signal: AbortSignal,
  options: ModuleReaderOptions = {},
): ModuleReader {
  const pending = new Map<string, PendingRequest>();
  let disposed = false;

  // Custom responses can arrive out of order on a shared model channel. Match
  // both request ID and echoed path before accepting source.
  const onMessage: Parameters<AnyWidgetBundleModel["on"]>[1] = (message, buffers: DataView[]) => {
    if (!isResponseEnvelope(message)) {
      return;
    }

    const request = pending.get(message.id);

    if (!request) return;
    finish(message.id, () => {
      if (message.version !== PROTOCOL_VERSION || !isString(message.path)) {
        request.reject(invalidResponse(request.path));

        return;
      }

      if (message.path !== request.path) {
        request.reject(
          new BundleModuleRequestError(
            "path_mismatch",
            `Bundle module response path does not match ${request.path}.`,
          ),
        );

        return;
      }

      if (message.error !== undefined) {
        if (!isModuleError(message.error)) {
          request.reject(invalidResponse(request.path));

          return;
        }

        request.reject(new BundleModuleRequestError(message.error.code, message.error.message));

        return;
      }

      if (buffers.length !== 1) {
        request.reject(
          new BundleModuleRequestError(
            "invalid_response",
            `Bundle module ${request.path} must return one binary buffer.`,
          ),
        );

        return;
      }

      try {
        // Python keeps correlation metadata in JSON and sends source as one
        // binary buffer so strict UTF-8 decoding happens at this boundary.
        request.resolve(new TextDecoder("utf-8", { fatal: true }).decode(buffers[0]));
      } catch {
        request.reject(
          new BundleModuleRequestError(
            "invalid_source",
            `Bundle module ${request.path} did not return valid UTF-8 source.`,
          ),
        );
      }
    });
  };

  // Remove correlation state before settlement. Response, timeout, send
  // failure, and abort paths may race.
  const finish = (id: string, complete: () => void) => {
    const request = pending.get(id);

    if (!request) return;
    pending.delete(id);
    globalThis.clearTimeout(request.timeout);
    complete();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    model.off("msg:custom", onMessage);

    for (const [id, request] of pending) {
      finish(id, () => request.reject(abortError()));
    }
  };

  model.on("msg:custom", onMessage);
  signal.addEventListener("abort", dispose, { once: true });

  if (signal.aborted) dispose();

  return {
    read(path) {
      if (disposed || signal.aborted) return Promise.reject(abortError());
      const id = createBundleId();

      return new Promise<string>((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => {
          finish(id, () =>
            reject(
              new BundleModuleRequestError("timeout", `Timed out loading bundle module ${path}.`),
            ),
          );
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        // Register before send because a model adapter may answer synchronously.
        pending.set(id, { path, resolve, reject, timeout });

        try {
          model.send({
            type: REQUEST_TYPE,
            version: PROTOCOL_VERSION,
            id,
            path,
          });
        } catch (error) {
          finish(id, () => reject(error));
        }
      });
    },
    dispose,
  };
}

function invalidResponse(path: string): BundleModuleRequestError {
  return new BundleModuleRequestError(
    "invalid_response",
    `Bundle module ${path} returned an invalid response.`,
  );
}

interface ResponseEnvelope {
  type: typeof RESPONSE_TYPE;
  id: string;
  version?: unknown;
  path?: unknown;
  error?: unknown;
}

function isResponseEnvelope(value: unknown): value is ResponseEnvelope {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in value &&
    value.type === RESPONSE_TYPE &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function isModuleError(value: unknown): value is { code: string; message: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function abortError(): DOMException {
  return new DOMException("Anywidget bundle module request aborted", "AbortError");
}
