import { AsyncLocalStorage } from 'node:async_hooks';

import type { Logger } from 'pino';

/** Những gì được mang theo suốt vòng đời một request. */
export interface RequestContext {
  readonly requestId: string;
  /** Child logger đã gắn sẵn `requestId` — mọi dòng nó ghi ra đều có id. */
  readonly logger: Logger;
}

/**
 * BƯỚC 4 (phần lõi) — mang `requestId` đi ngầm qua các lời gọi async.
 *
 * Vì sao cần `AsyncLocalStorage` mà không chỉ gắn vào `req.log`:
 * gắn vào `req` thì mọi service ở tầng sâu đều phải nhận `req.log` như một
 * tham số, luồn qua controller -> domain -> data. Chỉ cần một chỗ quên là
 * dòng log đó rớt correlation, và ta chỉ phát hiện lúc đang debug sự cố.
 *
 * `AsyncLocalStorage` giữ context xuyên qua `await`, `setTimeout`, promise
 * chain — nên `HealthDbRepository` ở tận tầng data vẫn log ra đúng requestId
 * mà chữ ký hàm không đổi một chữ nào.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Lấy context của request hiện tại, hoặc `undefined` nếu đang ngoài request. */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}
