/**
 * Simple event emitter for tour lifecycle events
 */

import type { TourEventCallback, TourEvents, TourEventType } from './types';

export class TourEventEmitter {
  private listeners: Map<TourEventType, Set<TourEventCallback<TourEventType>>> =
    new Map();

  /**
   * Subscribe to a tour event
   */
  on<T extends TourEventType>(event: T, callback: TourEventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners
      .get(event)!
      .add(callback as TourEventCallback<TourEventType>);
  }

  /**
   * Unsubscribe from a tour event
   */
  off<T extends TourEventType>(event: T, callback: TourEventCallback<T>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as TourEventCallback<TourEventType>);
    }
  }

  /**
   * Emit a tour event
   */
  emit<T extends TourEventType>(event: T, data: TourEvents[T]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          (callback as TourEventCallback<T>)(data);
        } catch (error) {
          console.error(`[TourPilot] Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event, or all listeners if no event specified
   */
  removeAllListeners(event?: TourEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
