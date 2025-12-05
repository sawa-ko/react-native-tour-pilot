/**
 * useTourControl - Hook for controlling a specific tour
 */

import { useCallback, useEffect, useRef } from 'react';

import { useTour } from './TourProvider';
import type {
  Step,
  TourControl,
  TourKey,
  UseTourControlOptions,
} from './types';

/**
 * Hook for controlling a specific tour with lifecycle callbacks
 *
 * @param tourKey - The unique identifier for the tour
 * @param options - Optional callbacks and configuration
 * @returns Tour control methods and state
 *
 * @example
 * ```tsx
 * const { start, stop, isActive, currentStepNumber } = useTourControl(
 *   "onboarding",
 *   {
 *     onStart: () => console.log("Tour started"),
 *     onStop: (completed) => {
 *       if (completed) {
 *         AsyncStorage.setItem("onboarding_done", "true");
 *       }
 *     },
 *     onStepChange: (step, number) => {
 *       analytics.track("tour_step", { step: number });
 *     },
 *   }
 * );
 *
 * // Start the tour
 * useEffect(() => {
 *   start();
 * }, []);
 * ```
 */
export function useTourControl(
  tourKey: TourKey,
  options?: UseTourControlOptions
): TourControl {
  const tour = useTour();
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const handleStart = (data: { tourKey: TourKey }) => {
      if (data.tourKey === tourKey) optionsRef.current?.onStart?.();
    };

    const handleStop = (data: { tourKey: TourKey; completed: boolean }) => {
      if (data.tourKey === tourKey)
        optionsRef.current?.onStop?.(data.completed);
    };

    const handleStepChange = (data: {
      tourKey: TourKey;
      step: Step | undefined;
      stepNumber: number;
    }) => {
      if (data.tourKey === tourKey)
        optionsRef.current?.onStepChange?.(data.step, data.stepNumber);
    };

    tour.on('start', handleStart);
    tour.on('stop', handleStop);
    tour.on('stepChange', handleStepChange);

    return () => {
      tour.off('start', handleStart);
      tour.off('stop', handleStop);
      tour.off('stepChange', handleStepChange);
    };
  }, [tour, tourKey]);

  const start = useCallback(
    async (fromStep?: string) => {
      await tour.start(
        tourKey,
        fromStep,
        optionsRef.current?.scrollViewRef?.current
      );
    },
    [tour, tourKey]
  );

  const stop = useCallback(async () => {
    await tour.stop();
  }, [tour]);

  const isActive = tour.activeTour === tourKey && tour.visible;

  return {
    start,
    stop,
    isActive,
    currentStep: isActive ? tour.currentStep : undefined,
    currentStepNumber: isActive ? tour.currentStepNumber : 0,
    totalStepsNumber: isActive ? tour.totalStepsNumber : 0,
  };
}

/**
 * Hook to check if any tour is currently active
 *
 * @returns boolean indicating if a tour is visible
 *
 * @example
 * ```tsx
 * const isTourActive = useIsTourActive();
 *
 * // Hide certain UI elements during tour
 * if (isTourActive) {
 *   return null;
 * }
 * ```
 */
export function useIsTourActive(): boolean {
  const tour = useTour();
  return tour.visible;
}

/**
 * Hook to get the currently active tour key
 *
 * @returns The active tour key, or null if no tour is active
 *
 * @example
 * ```tsx
 * const activeTour = useActiveTour();
 *
 * if (activeTour === "onboarding") {
 *   // Show onboarding-specific UI
 * }
 * ```
 */
export function useActiveTour(): TourKey | null {
  const tour = useTour();
  return tour.activeTour;
}
