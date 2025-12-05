/**
 * react-native-tour-pilot
 *
 * A flexible, customizable tour/walkthrough library for React Native
 * with multi-tour support, mask shapes, and Portal-based rendering.
 *
 * @packageDocumentation
 */

// Core components
export { TourProvider, useTour } from './TourProvider';
export { TourStep, walkthroughable } from './TourStep';

// Hooks
export {
  useTourControl,
  useIsTourActive,
  useActiveTour,
} from './useTourControl';

// Event emitter (for advanced usage)
export { TourEventEmitter } from './eventEmitter';

// Types
export type {
  // Core types
  TourKey,
  MaskShape,
  LayoutRect,
  ValueXY,
  Step,

  // Component props
  TourStepProps,
  TooltipProps,
  StepNumberProps,
  TourProviderOptions,

  // Hook types
  TourControl,
  UseTourControlOptions,
  TourContextValue,

  // Event types
  TourEvents,
  TourEventType,
  TourEventCallback,

  // Utility types
  Labels,
  SvgMaskPathFunction,
} from './types';
