/**
 * TourProvider - Web-compatible version for React Native Web
 *
 * Key differences from TourProvider.tsx:
 * - No BackHandler (not available on web)
 * - No NativeModules (not available on web)
 * - No StatusBar.currentHeight (always 0 on web)
 * - Animated.Value replaced with useState for tooltip/step-number positioning
 * - SvgMask uses static react-native-svg Path updated via useState (no setNativeProps)
 * - Portal container uses position: fixed via inline style for true full-screen overlay
 */

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  Dimensions,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { TourEventEmitter } from './eventEmitter';
import type {
  LayoutRect,
  MaskShape,
  Step,
  StepNumberProps,
  TourContextValue,
  TourEventCallback,
  TourEventType,
  TourKey,
  TourProviderOptions,
  ValueXY,
} from './types';
import DefaultTooltip from './ToolTip';

// Constants
const STEP_NUMBER_RADIUS = 14;
const STEP_NUMBER_DIAMETER = STEP_NUMBER_RADIUS * 2;
const ZINDEX = 100;
const DEFAULT_MARGIN = 13;
const DEFAULT_HIGHLIGHT_PADDING = 4;
const DEFAULT_ARROW_SIZE = 6;
const MAX_START_TRIES = 120;

const getWindowDimensions = () => {
  if (typeof window !== 'undefined') {
    return { width: window.innerWidth, height: window.innerHeight };
  }
  return Dimensions.get('window');
};

// Context
const TourContext = createContext<TourContextValue | undefined>(undefined);

/**
 * Hook to access the tour context
 * @throws Error if used outside of TourProvider
 */
export const useTour = (): TourContextValue => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};

// Steps Reducer
type StepsState = Record<TourKey, Record<string, Step>>;
type StepsAction =
  | { type: 'register'; step: Step }
  | { type: 'unregister'; stepName: string; tourKey: TourKey };

function stepsReducer(state: StepsState, action: StepsAction): StepsState {
  switch (action.type) {
    case 'register': {
      const { tourKey, name } = action.step;
      const tourSteps = state[tourKey] || {};
      return {
        ...state,
        [tourKey]: { ...tourSteps, [name]: action.step },
      };
    }
    case 'unregister': {
      const { tourKey, stepName } = action;
      const tourSteps = state[tourKey];
      if (!tourSteps) return state;

      const { [stepName]: _, ...remainingSteps } = tourSteps;
      return { ...state, [tourKey]: remainingSteps };
    }
    default:
      return state;
  }
}

// useStateWithAwait hook - allows awaiting state updates
function useStateWithAwait<T>(
  initialState: T
): [T, (newState: T) => Promise<void>] {
  const endPending = useRef<() => void>(() => {});
  const newDesiredValue = useRef<T>(initialState);
  const [state, setState] = useState<T>(initialState);

  const setStateWithAwait = useCallback(async (newState: T): Promise<void> => {
    const pending = new Promise<void>((resolve) => {
      endPending.current = resolve;
    });
    newDesiredValue.current = newState;
    setState(newState);
    await pending;
  }, []);

  useEffect(() => {
    if (state === newDesiredValue.current) {
      endPending.current();
    }
  }, [state]);

  return [state, setStateWithAwait];
}

// Default Step Number Component
const DefaultStepNumber: React.FC<StepNumberProps> = ({
  currentStepNumber,
}) => (
  <View style={defaultStyles.stepNumber}>
    <Text style={defaultStyles.stepNumberText}>{currentStepNumber}</Text>
  </View>
);

// Path generator (pure function, no Animated dependency)
function generateStaticPath(
  position: ValueXY,
  size: ValueXY,
  canvasSize: ValueXY,
  borderRadius: number,
  maskShape: MaskShape
): string {
  const outerPath = `M0,0H${canvasSize.x}V${canvasSize.y}H0V0Z`;
  let innerPath: string;

  switch (maskShape) {
    case 'circle': {
      const diameter = Math.min(size.x, size.y);
      const radius = diameter / 2;
      const centerX = position.x + size.x / 2;
      const centerY = position.y + size.y / 2;
      innerPath = `M${centerX - radius},${centerY}A${radius},${radius} 0 1 0 ${centerX + radius},${centerY}A${radius},${radius} 0 1 0 ${centerX - radius},${centerY}Z`;
      break;
    }
    case 'rectangle': {
      innerPath = `M${position.x},${position.y}H${position.x + size.x}V${position.y + size.y}H${position.x}V${position.y}Z`;
      break;
    }
    case 'rounded-rectangle':
    default: {
      const r = Math.min(borderRadius, size.x / 2, size.y / 2);
      innerPath = `M${position.x + r},${position.y}H${position.x + size.x - r}A${r},${r} 0 0 1 ${position.x + size.x},${position.y + r}V${position.y + size.y - r}A${r},${r} 0 0 1 ${position.x + size.x - r},${position.y + size.y}H${position.x + r}A${r},${r} 0 0 1 ${position.x},${position.y + size.y - r}V${position.y + r}A${r},${r} 0 0 1 ${position.x + r},${position.y}Z`;
      break;
    }
  }

  return `${outerPath}${innerPath}`;
}

// Web-compatible SVG Mask Component (no Animated, no setNativeProps)
interface SvgMaskWebProps {
  size: ValueXY;
  position: ValueXY;
  canvasSize: ValueXY;
  backdropColor: string;
  borderRadius: number;
  maskShape: MaskShape;
  onClick?: () => boolean;
}

const SvgMaskWeb: React.FC<SvgMaskWebProps> = ({
  size,
  position,
  canvasSize,
  backdropColor,
  borderRadius,
  maskShape,
  onClick,
}) => {
  // Compute path directly via useMemo; using full object refs as deps is correct
  // since inline objects are recreated only when parent state changes
  const pathD = useMemo(
    () =>
      generateStaticPath(position, size, canvasSize, borderRadius, maskShape),
    [position, size, canvasSize, borderRadius, maskShape]
  );

  return (
    <View
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={[StyleSheet.absoluteFill, { position: 'fixed' as any }]}
      onStartShouldSetResponder={onClick}
      pointerEvents="box-only"
    >
      <Svg
        pointerEvents="none"
        width={canvasSize.x}
        height={canvasSize.y}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style={{ position: 'absolute' as any, top: 0, left: 0 }}
      >
        <Path fill={backdropColor} fillRule="evenodd" d={pathD} />
      </Svg>
    </View>
  );
};

// Tour Modal Component
interface ModalRef {
  animateMove: (
    rect: LayoutRect,
    maskShape?: MaskShape,
    stepBorderRadius?: number
  ) => Promise<void>;
}

interface ModalProps extends TourProviderOptions {
  currentStep?: Step;
  visible: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
  currentStepNumber: number;
  totalStepsNumber: number;
  onStop: () => Promise<void>;
  onNext: () => Promise<void>;
  onPrev: () => Promise<void>;
  portalHostName?: string;
}

const TourModal = forwardRef<ModalRef, ModalProps>(function TourModal(
  {
    easing: _easing = Easing.elastic(0.7),
    animationDuration = 400,
    tooltipComponent: TooltipComponent = DefaultTooltip,
    tooltipStyle = {},
    stepNumberComponent: StepNumberComponent = DefaultStepNumber,
    // On web, animated is always true (CSS transitions handle smoothness)
    animated: _animated = true,
    backdropColor = 'rgba(0, 0, 0, 0.75)',
    labels = {
      finish: 'Finish',
      next: 'Next',
      previous: 'Previous',
      skip: 'Skip',
    },
    stopOnOutsideClick = false,
    arrowColor = '#fff',
    arrowSize = DEFAULT_ARROW_SIZE,
    margin = DEFAULT_MARGIN,
    borderRadius = 8,
    currentStep,
    visible,
    isFirstStep,
    isLastStep,
    currentStepNumber,
    totalStepsNumber,
    onStop,
    onNext,
    onPrev,
  },
  ref
) {
  const [tooltipStyles, setTooltipStyles] = useState<ViewStyle>({});
  const [arrowStyles, setArrowStyles] = useState<ViewStyle>({});
  // Plain state instead of Animated.Value for web compatibility
  const [stepNumberTop, setStepNumberTop] = useState(0);
  const [stepNumberLeft, setStepNumberLeft] = useState(0);

  const initialDims = getWindowDimensions();
  const [layout, setLayout] = useState<LayoutRect>({
    x: 0,
    y: 0,
    width: initialDims.width,
    height: initialDims.height,
  });
  const [maskRect, setMaskRect] = useState<LayoutRect | undefined>();
  const [currentMaskShape, setCurrentMaskShape] =
    useState<MaskShape>('rounded-rectangle');
  const [currentBorderRadius, setCurrentBorderRadius] =
    useState<number>(borderRadius);
  const [containerVisible, setContainerVisible] = useState(false);

  // No BackHandler on web

  useEffect(() => {
    if (visible) {
      setContainerVisible(true);
      const dims = getWindowDimensions();
      setLayout({ x: 0, y: 0, width: dims.width, height: dims.height });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setContainerVisible(false);
    }
  }, [visible]);

  // Listen for dimension changes (works on web via Dimensions API or resize)
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setLayout({ x: 0, y: 0, width: window.width, height: window.height });
    });

    // Also listen to native window resize for web
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setLayout({
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      subscription.remove();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  const _animateMove = useCallback(
    async (
      rect: LayoutRect,
      maskShape: MaskShape = 'rounded-rectangle',
      stepBorderRadius?: number
    ) => {
      const measuredLayout = layout;

      setCurrentMaskShape(maskShape);
      setCurrentBorderRadius(stepBorderRadius ?? borderRadius);

      let snLeft = rect.x - STEP_NUMBER_RADIUS;
      if (snLeft < 0) {
        snLeft = rect.x + rect.width - STEP_NUMBER_RADIUS;
        if (snLeft > measuredLayout.width - STEP_NUMBER_DIAMETER) {
          snLeft = measuredLayout.width - STEP_NUMBER_DIAMETER;
        }
      }

      const center = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
      const relativeToBottom = Math.abs(center.y - measuredLayout.height);
      const relativeToTop = center.y;
      const relativeToLeft = center.x;
      const relativeToRight = Math.abs(center.x - measuredLayout.width);

      const verticalPosition =
        relativeToBottom > relativeToTop ? 'bottom' : 'top';
      const horizontalPosition =
        relativeToLeft > relativeToRight ? 'left' : 'right';

      const tooltip: ViewStyle = {};
      const arrow: ViewStyle = { position: 'absolute' };

      if (verticalPosition === 'bottom') {
        tooltip.top = rect.y + rect.height + margin;
        arrow.borderBottomColor = arrowColor;
        arrow.borderTopColor = 'transparent';
        arrow.borderLeftColor = 'transparent';
        arrow.borderRightColor = 'transparent';
        arrow.top = (tooltip.top as number) - arrowSize * 2;
      } else {
        tooltip.bottom = measuredLayout.height - (rect.y - margin);
        arrow.borderTopColor = arrowColor;
        arrow.borderLeftColor = 'transparent';
        arrow.borderRightColor = 'transparent';
        arrow.borderBottomColor = 'transparent';
        arrow.bottom = (tooltip.bottom as number) - arrowSize * 2;
      }

      if (horizontalPosition === 'left') {
        tooltip.right = Math.max(
          measuredLayout.width - (rect.x + rect.width),
          0
        );
        tooltip.right = tooltip.right === 0 ? margin : tooltip.right;
        tooltip.maxWidth =
          measuredLayout.width - (tooltip.right as number) - margin;
        arrow.right = (tooltip.right as number) + margin;
      } else {
        tooltip.left = Math.max(rect.x, 0);
        tooltip.left = tooltip.left === 0 ? margin : tooltip.left;
        tooltip.maxWidth =
          measuredLayout.width - (tooltip.left as number) - margin;
        arrow.left = (tooltip.left as number) + margin;
      }

      // Use plain state instead of Animated.Value
      setStepNumberTop(rect.y - STEP_NUMBER_RADIUS);
      setStepNumberLeft(snLeft);
      setTooltipStyles(tooltip);
      setArrowStyles(arrow);
      setMaskRect({
        width: rect.width,
        height: rect.height,
        x: Math.floor(Math.max(rect.x, 0)),
        y: Math.floor(Math.max(rect.y, 0)),
      });
    },
    [arrowColor, arrowSize, borderRadius, layout, margin]
  );

  const animateMove = useCallback(
    async (
      rect: LayoutRect,
      maskShape?: MaskShape,
      stepBorderRadius?: number
    ): Promise<void> => {
      return new Promise((resolve) => {
        setContainerVisible(true);
        requestAnimationFrame(async () => {
          await _animateMove(rect, maskShape, stepBorderRadius);
          resolve();
        });
      });
    },
    [_animateMove]
  );

  useImperativeHandle(ref, () => ({ animateMove }), [animateMove]);

  const handleMaskClick = () => {
    if (stopOnOutsideClick) {
      onStop().catch((_e) => {
        /* ignore */
      });
    }
    return true;
  };

  const modalVisible = containerVisible && visible;
  const contentVisible = maskRect != null && containerVisible;

  if (!modalVisible) return null;

  // CSS transition string passed through React Native Web's style prop
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transitionStyle: any = {
    transition: `top ${animationDuration}ms ease, bottom ${animationDuration}ms ease, left ${animationDuration}ms ease, right ${animationDuration}ms ease`,
  };

  const modalContent = (
    <View
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      style={[defaultStyles.portalContainer, { position: 'fixed' as any }]}
      pointerEvents="box-none"
    >
      <View style={defaultStyles.container} pointerEvents="box-none">
        {contentVisible && maskRect && (
          <SvgMaskWeb
            size={{ x: maskRect.width, y: maskRect.height }}
            position={{ x: maskRect.x, y: maskRect.y }}
            canvasSize={{ x: layout.width, y: layout.height }}
            backdropColor={backdropColor}
            borderRadius={currentBorderRadius}
            maskShape={currentMaskShape}
            onClick={handleMaskClick}
          />
        )}

        {contentVisible && currentStep && (
          <>
            <View
              style={[
                defaultStyles.stepNumberContainer,
                { left: stepNumberLeft, top: stepNumberTop },
                transitionStyle,
              ]}
            >
              <StepNumberComponent
                currentStepNumber={currentStepNumber}
                totalStepsNumber={totalStepsNumber}
              />
            </View>

            {arrowSize > 0 && (
              <View
                style={[
                  defaultStyles.arrow,
                  { borderWidth: arrowSize },
                  arrowStyles,
                  transitionStyle,
                ]}
              />
            )}

            <View
              style={[
                defaultStyles.tooltip,
                tooltipStyles,
                tooltipStyle,
                transitionStyle,
              ]}
              pointerEvents="box-none"
            >
              <View pointerEvents="auto">
                <TooltipComponent
                  currentStep={currentStep}
                  currentStepNumber={currentStepNumber}
                  totalStepsNumber={totalStepsNumber}
                  isFirstStep={isFirstStep}
                  isLastStep={isLastStep}
                  labels={labels}
                  goToNext={onNext}
                  goToPrev={onPrev}
                  stop={onStop}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );

  return modalContent;
});

/**
 * TourProvider - Wrap your app with this provider to enable tours (web version)
 */
export const TourProvider: React.FC<
  PropsWithChildren<TourProviderOptions & { portalHostName?: string }>
> = ({
  children,
  verticalOffset = 0,
  portalHostName: _portalHostName = 'tour-pilot-portal',
  highlightPadding = DEFAULT_HIGHLIGHT_PADDING,
  ...options
}) => {
  const startTries = useRef(0);
  const events = useRef(new TourEventEmitter()).current;
  const modalRef = useRef<ModalRef>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const [visible, setVisibility] = useStateWithAwait(false);
  const [activeTour, setActiveTour] = useState<TourKey | null>(null);
  const [currentStep, setCurrentStepState] = useState<Step | undefined>();
  const [steps, dispatch] = useReducer(stepsReducer, {});

  const orderedSteps = useMemo(() => {
    if (!activeTour) return [];
    const tourSteps = steps[activeTour] || {};
    return Object.values(tourSteps)
      .filter((s) => s.visible)
      .sort((a, b) => a.order - b.order);
  }, [steps, activeTour]);

  const stepIndex = useMemo(
    () =>
      currentStep
        ? orderedSteps.findIndex((s) => s.order === currentStep.order)
        : -1,
    [currentStep, orderedSteps]
  );
  const currentStepNumber = stepIndex + 1;
  const totalStepsNumber = orderedSteps.length;
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === orderedSteps.length - 1;

  const registerStep = useCallback(
    (step: Step) => dispatch({ type: 'register', step }),
    []
  );
  const unregisterStep = useCallback(
    (stepName: string, tourKey: TourKey) =>
      dispatch({ type: 'unregister', stepName, tourKey }),
    []
  );

  const moveModalToStep = useCallback(
    async (step: Step | undefined) => {
      if (!step) return;
      const measurement = await step.measure();
      if (!measurement) return;

      const padding = step.highlightPadding ?? highlightPadding;

      await modalRef.current?.animateMove(
        {
          width: measurement.width + padding,
          height: measurement.height + padding,
          x: measurement.x - padding / 2,
          y: measurement.y - padding / 2 + verticalOffset,
        },
        step.maskShape,
        step.borderRadius
      );
    },
    [verticalOffset, highlightPadding]
  );

  const setCurrentStep = useCallback(
    async (step: Step | undefined, move = true) => {
      setCurrentStepState(step);

      // No measureLayout on web - skip scroll handling
      // getBoundingClientRect in TourStep.web.tsx returns viewport-relative coords

      if (move && step) {
        await moveModalToStep(step);
      }
    },
    [moveModalToStep]
  );

  const remeasureCurrentStep = useCallback(async () => {
    if (currentStep) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await moveModalToStep(currentStep);
    }
  }, [currentStep, moveModalToStep]);

  const start = useCallback(
    async (
      tourKey: TourKey,
      fromStep?: string,
      scrollView?: ScrollView | null
    ) => {
      if (scrollView) scrollViewRef.current = scrollView;

      const tourSteps = steps[tourKey] || {};
      const orderedTourSteps = Object.values(tourSteps)
        .filter((s) => s.visible)
        .sort((a, b) => a.order - b.order);

      const firstStep = fromStep ? tourSteps[fromStep] : orderedTourSteps[0];

      if (startTries.current > MAX_START_TRIES) {
        startTries.current = 0;
        console.warn(
          `[TourPilot] Failed to start tour "${tourKey}" - no steps found`
        );
        return;
      }

      if (!firstStep) {
        startTries.current += 1;
        requestAnimationFrame(() => {
          start(tourKey, fromStep, scrollView).catch((_e) => {
            /* ignore */
          });
        });
        return;
      }

      setActiveTour(tourKey);
      events.emit('start', { tourKey });

      await setCurrentStep(firstStep);
      await moveModalToStep(firstStep);
      await setVisibility(true);

      startTries.current = 0;
    },
    [steps, setCurrentStep, moveModalToStep, setVisibility, events]
  );

  const stop = useCallback(async () => {
    const tourKey = activeTour;
    const completed = isLastStep;

    await setVisibility(false);
    setActiveTour(null);
    setCurrentStepState(undefined);
    scrollViewRef.current = null;

    if (tourKey) events.emit('stop', { tourKey, completed });
  }, [activeTour, isLastStep, setVisibility, events]);

  const goToNext = useCallback(async () => {
    const nextStep = orderedSteps[stepIndex + 1];
    if (nextStep) {
      events.emit('stepChange', {
        tourKey: activeTour!,
        step: nextStep,
        stepNumber: stepIndex + 2,
      });
      await setCurrentStep(nextStep);
    } else {
      await stop();
    }
  }, [orderedSteps, stepIndex, setCurrentStep, stop, events, activeTour]);

  const goToPrev = useCallback(async () => {
    const prevStep = orderedSteps[stepIndex - 1];
    if (prevStep) {
      events.emit('stepChange', {
        tourKey: activeTour!,
        step: prevStep,
        stepNumber: stepIndex,
      });
      await setCurrentStep(prevStep);
    }
  }, [orderedSteps, stepIndex, setCurrentStep, events, activeTour]);

  const goToNth = useCallback(
    async (n: number) => {
      const step = orderedSteps[n - 1];
      if (step) {
        events.emit('stepChange', {
          tourKey: activeTour!,
          step,
          stepNumber: n,
        });
        await setCurrentStep(step);
      }
    },
    [orderedSteps, setCurrentStep, events, activeTour]
  );

  const on = useCallback(
    <T extends TourEventType>(event: T, callback: TourEventCallback<T>) =>
      events.on(event, callback),
    [events]
  );

  const off = useCallback(
    <T extends TourEventType>(event: T, callback: TourEventCallback<T>) =>
      events.off(event, callback),
    [events]
  );

  const value = useMemo<TourContextValue>(
    () => ({
      registerStep,
      unregisterStep,
      start,
      stop,
      goToNext,
      goToPrev,
      goToNth,
      activeTour,
      currentStep,
      remeasureCurrentStep,
      visible,
      isFirstStep,
      isLastStep,
      currentStepNumber,
      totalStepsNumber,
      on,
      off,
    }),
    [
      registerStep,
      unregisterStep,
      start,
      stop,
      goToNext,
      goToPrev,
      goToNth,
      activeTour,
      currentStep,
      remeasureCurrentStep,
      visible,
      isFirstStep,
      isLastStep,
      currentStepNumber,
      totalStepsNumber,
      on,
      off,
    ]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourModal
        ref={modalRef}
        {...options}
        currentStep={currentStep}
        visible={visible}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        currentStepNumber={currentStepNumber}
        totalStepsNumber={totalStepsNumber}
        onStop={stop}
        onNext={goToNext}
        onPrev={goToPrev}
      />
    </TourContext.Provider>
  );
};

// Default Styles
const defaultStyles = StyleSheet.create({
  portalContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: ZINDEX,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    elevation: ZINDEX as any,
  },
  container: {
    flex: 1,
    position: 'relative',
  },
  arrow: {
    position: 'absolute',
    borderWidth: DEFAULT_ARROW_SIZE,
  },
  tooltip: {
    position: 'absolute',
    padding: 0,
    backgroundColor: 'transparent',
    borderRadius: 0,
    overflow: 'visible',
  },
  stepNumberContainer: {
    position: 'absolute',
    width: STEP_NUMBER_DIAMETER,
    height: STEP_NUMBER_DIAMETER,
    overflow: 'hidden',
    zIndex: ZINDEX + 1,
  },
  stepNumber: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: STEP_NUMBER_RADIUS,
    borderColor: '#FFFFFF',
    backgroundColor: '#27ae60',
  },
  stepNumberText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
