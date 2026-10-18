export interface CoairPreviewController { goTo(i: number): void; pause(): void; play(): void; destroy(): void; }
export interface CoairPreviewOptions { autoplay?: boolean; startAt?: number; }
export function mountCoairPreview(root: HTMLElement, content: unknown, opts?: CoairPreviewOptions): CoairPreviewController;
