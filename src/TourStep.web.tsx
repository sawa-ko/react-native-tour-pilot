/**
 * TourStep - Web-compatible wrapper component to mark elements as tour steps
 */

import React, { cloneElement, useEffect, useMemo, useRef } from 'react';

import { useTour } from './TourProvider';
import type { LayoutRect, TourStepProps } from './types';

/**
 * TourStep - Wrap elements you want to highlight in your tour (web version)
 *
 * Uses getBoundingClientRect() instead of NativeMethods.measure for web.
 *
 * @example
 * ```tsx
 * <TourStep
 *   tourKey="onboarding"
 *   name="profile"
 *   order={1}
 *   text="Welcome||Tap here to access your profile"
 * >
 *   <WalkthroughableView>
 *     <ProfileButton />
 *   </WalkthroughableView>
 * </TourStep>
 * ```
 */
export const TourStep: React.FC<TourStepProps> = ({
  name,
  order,
  text,
  tourKey,
  active = true,
  children,
  maskShape = 'rounded-rectangle',
  borderRadius,
  highlightPadding,
}) => {
  const registeredName = useRef<string | null>(null);
  const {
    registerStep,
    unregisterStep,
    currentStep,
    activeTour,
    remeasureCurrentStep,
  } = useTour();
  const wrapperRef = useRef<HTMLElement>(null);

  const measure = async (): Promise<LayoutRect | null> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 60;
      const attemptMeasure = () => {
        if (attempts >= MAX_ATTEMPTS) {
          resolve(null);
          return;
        }
        attempts++;
        const node = wrapperRef.current;
        if (node && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            requestAnimationFrame(attemptMeasure);
          } else {
            resolve({
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            });
          }
        } else {
          requestAnimationFrame(attemptMeasure);
        }
      };
      attemptMeasure();
    });
  };

  useEffect(() => {
    if (active) {
      if (registeredName.current && registeredName.current !== name) {
        unregisterStep(registeredName.current, tourKey);
      }

      registerStep({
        name,
        order,
        text,
        tourKey,
        visible: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wrapperRef: wrapperRef as any,
        measure,
        maskShape,
        borderRadius,
        highlightPadding,
      });

      registeredName.current = name;
    }
  }, [
    name,
    order,
    text,
    tourKey,
    active,
    registerStep,
    unregisterStep,
    maskShape,
    borderRadius,
    highlightPadding,
  ]);

  useEffect(() => {
    if (active) {
      return () => {
        if (registeredName.current) {
          unregisterStep(registeredName.current, tourKey);
        }
      };
    }
    return undefined;
  }, [tourKey, active, unregisterStep]);

  const tourPilotProps = useMemo(
    () => ({
      ref: wrapperRef,
      onLayout: () => {
        if (currentStep?.name === name && activeTour === tourKey) {
          void remeasureCurrentStep();
        }
      },
      collapsable: false,
    }),
    [currentStep, activeTour, name, tourKey, remeasureCurrentStep]
  );

  // Support both 'tourPilot' and 'copilot' prop names for backwards compatibility
  return cloneElement(children, {
    tourPilot: tourPilotProps,
    copilot: tourPilotProps,
  });
};

/**
 * Higher-order component to make any component walkthrough-able (web version)
 *
 * @example
 * ```tsx
 * import { View, Pressable } from 'react-native';
 *
 * const WalkthroughableView = walkthroughable(View);
 * const WalkthroughablePressable = walkthroughable(Pressable);
 * ```
 */
export function walkthroughable<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.FC<
  P & { tourPilot?: Record<string, unknown>; copilot?: Record<string, unknown> }
> {
  const Walkthroughable: React.FC<
    P & {
      tourPilot?: Record<string, unknown>;
      copilot?: Record<string, unknown>;
    }
  > = ({ tourPilot, copilot, ...props }) => {
    // Support both prop names
    const propsToSpread = tourPilot || copilot || {};
    return <WrappedComponent {...propsToSpread} {...(props as P)} />;
  };

  Walkthroughable.displayName = `Walkthroughable(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return Walkthroughable;
}
