/**
 * TourStep - Wrapper component to mark elements as tour steps
 */

import React, { cloneElement, useEffect, useMemo, useRef } from 'react';
import type { NativeMethods } from 'react-native';

import { useTour } from './TourProvider';
import type { LayoutRect, TourStepProps } from './types';

/**
 * TourStep - Wrap elements you want to highlight in your tour
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
}) => {
  const registeredName = useRef<string | null>(null);
  const { registerStep, unregisterStep } = useTour();
  const wrapperRef = useRef<NativeMethods>(null);

  const measure = async (): Promise<LayoutRect | null> => {
    return new Promise((resolve) => {
      const attemptMeasure = () => {
        if (wrapperRef.current && 'measure' in wrapperRef.current) {
          wrapperRef.current.measure((_ox, _oy, width, height, x, y) => {
            if (width === 0 && height === 0) {
              requestAnimationFrame(attemptMeasure);
            } else {
              resolve({ x, y, width, height });
            }
          });
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
        wrapperRef,
        measure,
        maskShape,
        borderRadius,
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
      onLayout: () => {},
      collapsable: false,
    }),
    []
  );

  // Support both 'tourPilot' and 'copilot' prop names for backwards compatibility
  return cloneElement(children, {
    tourPilot: tourPilotProps,
    copilot: tourPilotProps,
  });
};

/**
 * Higher-order component to make any component walkthrough-able
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
