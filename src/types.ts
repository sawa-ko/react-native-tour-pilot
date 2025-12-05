/**
 * react-native-tour-pilot
 * Type definitions for the tour system
 */

import type { NativeMethods, ScrollView, ViewStyle } from 'react-native';
import type { ReactElement, RefObject } from 'react';

/**
 * Unique identifier for a tour. Used to manage multiple independent tours.
 * @example "onboarding-tour", "feature-discovery", "settings-guide"
 */
export type TourKey = string;

/**
 * Shape of the spotlight mask that highlights tour elements.
 * - `circle`: Circular mask, ideal for round buttons, FABs, or avatars
 * - `rectangle`: Sharp-cornered rectangular mask
 * - `rounded-rectangle`: Rectangle with configurable border radius (default)
 */
export type MaskShape = 'circle' | 'rectangle' | 'rounded-rectangle';

/**
 * Layout rectangle with position and dimensions.
 */
export interface LayoutRect {
  /** X coordinate (from left edge) */
  x: number;
  /** Y coordinate (from top edge) */
  y: number;
  /** Width of the element */
  width: number;
  /** Height of the element */
  height: number;
}

/**
 * Represents a 2D coordinate or size.
 */
export interface ValueXY {
  x: number;
  y: number;
}

/**
 * Represents a single step in a tour.
 */
export interface Step {
  /** Unique name for this step within its tour */
  name: string;
  /** Order of this step (lower numbers come first) */
  order: number;
  /** Content to display in the tooltip. Use "Title||Body" format for title/body separation */
  text: string;
  /** The tour this step belongs to */
  tourKey: TourKey;
  /** Whether this step is currently visible/active */
  visible: boolean;
  /** Reference to the wrapped component */
  wrapperRef: RefObject<NativeMethods>;
  /** Function to measure the step's position and size */
  measure: () => Promise<LayoutRect | null>;
  /** Shape of the spotlight mask for this step */
  maskShape?: MaskShape;
  /** Custom border radius for this step (overrides provider default) */
  borderRadius?: number;
}

/**
 * Function to generate a custom SVG mask path.
 */
export type SvgMaskPathFunction = (args: {
  size: ValueXY;
  position: ValueXY;
  canvasSize: ValueXY;
  step: Step;
}) => string;

/**
 * Labels for tooltip navigation buttons.
 */
export interface Labels {
  /** Label for skip button */
  skip?: string;
  /** Label for previous button */
  previous?: string;
  /** Label for next button */
  next?: string;
  /** Label for finish button (last step) */
  finish?: string;
}

/**
 * Props passed to custom tooltip components.
 */
export interface TooltipProps {
  /** The current step being displayed */
  currentStep: Step | undefined;
  /** Current step number (1-indexed) */
  currentStepNumber: number;
  /** Total number of steps in the active tour */
  totalStepsNumber: number;
  /** Whether this is the first step */
  isFirstStep: boolean;
  /** Whether this is the last step */
  isLastStep: boolean;
  /** Navigation button labels */
  labels: Labels;
  /** Navigate to the next step */
  goToNext: () => Promise<void>;
  /** Navigate to the previous step */
  goToPrev: () => Promise<void>;
  /** Stop the tour */
  stop: () => Promise<void>;
}

/**
 * Props passed to custom step number components.
 */
export interface StepNumberProps {
  /** Current step number (1-indexed) */
  currentStepNumber: number;
  /** Total number of steps */
  totalStepsNumber: number;
}

/**
 * Configuration options for the TourProvider.
 */
export interface TourProviderOptions {
  /** Easing function for animations */
  easing?: (value: number) => number;
  /** Type of overlay mask ("svg" recommended) */
  overlay?: 'svg' | 'view';
  /** Duration of animations in milliseconds */
  animationDuration?: number;
  /** Custom tooltip component */
  tooltipComponent?: React.ComponentType<TooltipProps>;
  /** Additional styles for the tooltip container */
  tooltipStyle?: ViewStyle;
  /** Custom step number badge component */
  stepNumberComponent?: React.ComponentType<StepNumberProps>;
  /** Whether to animate transitions between steps */
  animated?: boolean;
  /** Labels for navigation buttons */
  labels?: Labels;
  /** Whether Android status bar is visible (affects positioning) */
  androidStatusBarVisible?: boolean;
  /** Custom SVG mask path generator */
  svgMaskPath?: SvgMaskPathFunction;
  /** Vertical offset for tooltip positioning */
  verticalOffset?: number;
  /** Color of the tooltip arrow */
  arrowColor?: string;
  /** Size of the tooltip arrow */
  arrowSize?: number;
  /** Margin between tooltip and highlighted element */
  margin?: number;
  /** Whether clicking outside the tooltip stops the tour */
  stopOnOutsideClick?: boolean;
  /** Color of the backdrop overlay */
  backdropColor?: string;
  /** Default border radius for rounded-rectangle masks */
  borderRadius?: number;
  /** Padding around highlighted elements */
  highlightPadding?: number;
  /** Name of the Portal host to render into */
  portalHostName?: string;
}

/**
 * Event types emitted by the tour system.
 */
export type TourEvents = {
  /** Emitted when a tour starts */
  start: { tourKey: TourKey };
  /** Emitted when a tour stops */
  stop: { tourKey: TourKey; completed: boolean };
  /** Emitted when the current step changes */
  stepChange: { tourKey: TourKey; step: Step | undefined; stepNumber: number };
};

/**
 * Names of tour events.
 */
export type TourEventType = keyof TourEvents;

/**
 * Callback function for tour events.
 */
export type TourEventCallback<T extends TourEventType> = (
  data: TourEvents[T]
) => void;

/**
 * Value provided by the TourContext.
 */
export interface TourContextValue {
  /** Register a step with the tour system */
  registerStep: (step: Step) => void;
  /** Unregister a step from the tour system */
  unregisterStep: (stepName: string, tourKey: TourKey) => void;
  /** Start a tour */
  start: (
    tourKey: TourKey,
    fromStep?: string,
    scrollView?: ScrollView | null
  ) => Promise<void>;
  /** Stop the current tour */
  stop: () => Promise<void>;
  /** Navigate to the next step */
  goToNext: () => Promise<void>;
  /** Navigate to the previous step */
  goToPrev: () => Promise<void>;
  /** Navigate to a specific step by number (1-indexed) */
  goToNth: (n: number) => Promise<void>;
  /** Currently active tour key, or null if no tour is active */
  activeTour: TourKey | null;
  /** Current step being displayed */
  currentStep: Step | undefined;
  /** Whether the tour overlay is visible */
  visible: boolean;
  /** Whether the current step is the first step */
  isFirstStep: boolean;
  /** Whether the current step is the last step */
  isLastStep: boolean;
  /** Current step number (1-indexed) */
  currentStepNumber: number;
  /** Total number of steps in the active tour */
  totalStepsNumber: number;
  /** Subscribe to tour events */
  on: <T extends TourEventType>(
    event: T,
    callback: TourEventCallback<T>
  ) => void;
  /** Unsubscribe from tour events */
  off: <T extends TourEventType>(
    event: T,
    callback: TourEventCallback<T>
  ) => void;
}

/**
 * Props for the TourStep component.
 */
export interface TourStepProps {
  /** Unique name for this step within its tour */
  name: string;
  /** Order of this step (lower numbers come first) */
  order: number;
  /** Content to display. Use "Title||Body" format for title/body separation */
  text: string;
  /** The tour this step belongs to */
  tourKey: TourKey;
  /** Whether this step is active (default: true) */
  active?: boolean;
  /** The element to highlight */
  children: ReactElement;
  /** Shape of the spotlight mask */
  maskShape?: MaskShape;
  /** Custom border radius (overrides provider default) */
  borderRadius?: number;
}

/**
 * Return value of the useTourControl hook.
 */
export interface TourControl {
  /** Start this tour */
  start: (fromStep?: string) => Promise<void>;
  /** Stop this tour */
  stop: () => Promise<void>;
  /** Whether this tour is currently active */
  isActive: boolean;
  /** Current step (only if this tour is active) */
  currentStep: Step | undefined;
  /** Current step number (only if this tour is active) */
  currentStepNumber: number;
  /** Total steps in this tour */
  totalStepsNumber: number;
}

/**
 * Options for the useTourControl hook.
 */
export interface UseTourControlOptions {
  /** Called when the tour starts */
  onStart?: () => void;
  /** Called when the tour stops */
  onStop?: (completed: boolean) => void;
  /** Called when the step changes */
  onStepChange?: (step: Step | undefined, stepNumber: number) => void;
  /** ScrollView reference for auto-scrolling */
  scrollViewRef?: RefObject<ScrollView>;
}
