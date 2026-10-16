/*
 * Los tipos publicados de `super-beautiful-toast` cubren el adaptador de Vue 3
 * y omiten el núcleo sin framework. Declaramos aquí la parte que usa React.
 */
declare module "super-beautiful-toast/core" {
  import type {
    ToastItem,
    ToastOptions,
    ToastPosition,
    ToastQueue,
    ToastVariant,
  } from "super-beautiful-toast";

  export interface ToastHost {
    /** Registra el elemento de un aviso recién creado. */
    bind(element: HTMLElement, id: number): void;
    /** Libera el elemento. Llamar cuando desaparece de la cola. */
    unbind(id: number): void;
    /** Animación de entrada; invoca `done` al terminar. */
    enter(element: HTMLElement, id: number, done: () => void): void;
    /** Animación de salida; invoca `done` al terminar. */
    leave(element: HTMLElement, id: number, done: () => void): void;
    relayout(id: number, options?: { instantId?: number | null; duration?: number; ease?: unknown; stagger?: number }): void;
    expand(): void;
    collapse(): void;
    pause(): void;
    resume(): void;
    destroy(): void;
    isExpanded(): boolean;
  }

  export function createToastQueue(settings?: Partial<import("super-beautiful-toast").QueueSettings>): ToastQueue;

  /**
   * Ojo con la firma: recibe **un objeto**, no la cola suelta.
   * `createToastHost(queue)` deja `queue` en undefined y revienta al enlazar.
   */
  export function createToastHost(config: { queue: ToastQueue; options?: Record<string, unknown> }): ToastHost;

  export const TOAST_POSITIONS: readonly ToastPosition[];

  export type { ToastItem, ToastOptions, ToastPosition, ToastQueue, ToastVariant };
}