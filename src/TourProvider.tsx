/**
 * TourProvider - Main provider component for the tour system
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
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  NativeModules,
  Platform,
  ScrollView,
  StatusBar,
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

// Optional Portal import - gracefully handle if not available
let Portal: React.ComponentType<{
  hostName?: string;
  children: React.ReactNode;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const portalModule = require('@gorhom/portal');
  Portal = portalModule.Portal;
} catch (_e) {
  // Portal not available, will use fallback rendering
}

// Constants
const STEP_NUMBER_RADIUS = 14;
const STEP_NUMBER_DIAMETER = STEP_NUMBER_RADIUS * 2;
const ZINDEX = 100;
const DEFAULT_MARGIN = 13;
const DEFAULT_HIGHLIGHT_PADDING = 4;
const DEFAULT_ARROW_SIZE = 6;
const MAX_START_TRIES = 120;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

// SVG Mask Component
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface SvgMaskProps {
  size: ValueXY;
  position: ValueXY;
  canvasSize: ValueXY;
  animated: boolean;
  animationDuration: number;
  easing: (value: number) => number;
  backdropColor: string;
  borderRadius: number;
  maskShape: MaskShape;
  onClick?: () => boolean;
}

const SvgMask: React.FC<SvgMaskProps> = ({
  size,
  position,
  canvasSize,
  animated,
  animationDuration,
  easing,
  backdropColor,
  borderRadius,
  maskShape,
  onClick,
}) => {
  const sizeValue = useRef(
    new Animated.ValueXY({ x: size.x, y: size.y })
  ).current;
  const positionValue = useRef(
    new Animated.ValueXY({ x: position.x, y: position.y })
  ).current;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pathRef = useRef<any>(null);

  const generatePath = useCallback(() => {
    const posX =
      (positionValue.x as unknown as { _value: number })._value ?? position.x;
    const posY =
      (positionValue.y as unknown as { _value: number })._value ?? position.y;
    const sizeX =
      (sizeValue.x as unknown as { _value: number })._value ?? size.x;
    const sizeY =
      (sizeValue.y as unknown as { _value: number })._value ?? size.y;

    // Outer rectangle (full canvas)
    const outerPath = `M0,0H${canvasSize.x}V${canvasSize.y}H0V0Z`;

    let innerPath: string;

    switch (maskShape) {
      case 'circle': {
        const diameter = Math.min(sizeX, sizeY);
        const radius = diameter / 2;
        const centerX = posX + sizeX / 2;
        const centerY = posY + sizeY / 2;

        innerPath = `M${centerX - radius},${centerY}A${radius},${radius} 0 1 0 ${centerX + radius},${centerY}A${radius},${radius} 0 1 0 ${centerX - radius},${centerY}Z`;
        break;
      }

      case 'rectangle': {
        innerPath = `M${posX},${posY}H${posX + sizeX}V${posY + sizeY}H${posX}V${posY}Z`;
        break;
      }

      case 'rounded-rectangle':
      default: {
        const r = Math.min(borderRadius, sizeX / 2, sizeY / 2);
        innerPath = `M${posX + r},${posY}H${posX + sizeX - r}A${r},${r} 0 0 1 ${posX + sizeX},${posY + r}V${posY + sizeY - r}A${r},${r} 0 0 1 ${posX + sizeX - r},${posY + sizeY}H${posX + r}A${r},${r} 0 0 1 ${posX},${posY + sizeY - r}V${posY + r}A${r},${r} 0 0 1 ${posX + r},${posY}Z`;
        break;
      }
    }

    return `${outerPath}${innerPath}`;
  }, [
    canvasSize,
    position,
    size,
    borderRadius,
    maskShape,
    positionValue,
    sizeValue,
  ]);

  const updatePath = useCallback(() => {
    const d = generatePath();
    if (pathRef.current) {
      (
        pathRef.current as unknown as {
          setNativeProps: (props: { d: string }) => void;
        }
      ).setNativeProps({ d });
    }
  }, [generatePath]);

  useEffect(() => {
    const listenerId = positionValue.addListener(updatePath);
    const sizeListenerId = sizeValue.addListener(updatePath);
    return () => {
      positionValue.removeListener(listenerId);
      sizeValue.removeListener(sizeListenerId);
    };
  }, [positionValue, sizeValue, updatePath]);

  useEffect(() => {
    if (animated) {
      Animated.parallel([
        Animated.timing(sizeValue, {
          toValue: { x: size.x, y: size.y },
          duration: animationDuration,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(positionValue, {
          toValue: { x: position.x, y: position.y },
          duration: animationDuration,
          easing,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      sizeValue.setValue({ x: size.x, y: size.y });
      positionValue.setValue({ x: position.x, y: position.y });
    }
  }, [
    animated,
    animationDuration,
    easing,
    position,
    positionValue,
    size,
    sizeValue,
  ]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={onClick}
      pointerEvents="box-only"
    >
      <Svg pointerEvents="none" width={canvasSize.x} height={canvasSize.y}>
        <AnimatedPath
          ref={pathRef}
          fill={backdropColor}
          fillRule="evenodd"
          d={generatePath()}
        />
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
    easing = Easing.elastic(0.7),
    animationDuration = 400,
    tooltipComponent: TooltipComponent = DefaultTooltip,
    tooltipStyle = {},
    stepNumberComponent: StepNumberComponent = DefaultStepNumber,
    animated = typeof NativeModules.RNSVGSvgViewManager !== 'undefined',
    androidStatusBarVisible = false,
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
    portalHostName = 'tour-pilot-portal',
  },
  ref
) {
  const [tooltipStyles, setTooltipStyles] = useState<ViewStyle>({});
  const [arrowStyles, setArrowStyles] = useState<ViewStyle>({});
  const [animatedValues] = useState({
    top: new Animated.Value(0),
    stepNumberLeft: new Animated.Value(0),
  });
  const [layout, setLayout] = useState<LayoutRect>({
    x: 0,
    y: 0,
    width: SCREEN_WIDTH,
    height:
      SCREEN_HEIGHT +
      (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0),
  });
  const [maskRect, setMaskRect] = useState<LayoutRect | undefined>();
  const [currentMaskShape, setCurrentMaskShape] =
    useState<MaskShape>('rounded-rectangle');
  const [currentBorderRadius, setCurrentBorderRadius] =
    useState<number>(borderRadius);
  const [isAnimated, setIsAnimated] = useState(false);
  const [containerVisible, setContainerVisible] = useState(false);

  // Handle Android back button
  useEffect(() => {
    if (!visible) return;

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (visible) {
          onStop().catch((_e) => {
            /* ignore */
          });
          return true;
        }
        return false;
      }
    );

    return () => backHandler.remove();
  }, [visible, onStop]);

  useEffect(() => {
    if (visible) {
      setContainerVisible(true);
      const { width, height } = Dimensions.get('window');
      setLayout({
        x: 0,
        y: 0,
        width,
        height:
          height +
          (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0),
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setIsAnimated(false);
      setContainerVisible(false);
    }
  }, [visible]);

  // Listen for dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setLayout({
        x: 0,
        y: 0,
        width: window.width,
        height:
          window.height +
          (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0),
      });
    });

    return () => subscription.remove();
  }, []);

  const _animateMove = useCallback(
    async (
      rect: LayoutRect,
      maskShape: MaskShape = 'rounded-rectangle',
      stepBorderRadius?: number
    ) => {
      const measuredLayout = layout;

      if (!androidStatusBarVisible && Platform.OS === 'android') {
        rect.y -= StatusBar.currentHeight ?? 0;
      }

      setCurrentMaskShape(maskShape);
      setCurrentBorderRadius(stepBorderRadius ?? borderRadius);

      let stepNumberLeft = rect.x - STEP_NUMBER_RADIUS;
      if (stepNumberLeft < 0) {
        stepNumberLeft = rect.x + rect.width - STEP_NUMBER_RADIUS;
        if (stepNumberLeft > measuredLayout.width - STEP_NUMBER_DIAMETER) {
          stepNumberLeft = measuredLayout.width - STEP_NUMBER_DIAMETER;
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

      const animate = [
        ['top', rect.y] as const,
        ['stepNumberLeft', stepNumberLeft] as const,
      ];

      if (isAnimated) {
        Animated.parallel(
          animate.map(([key, value]) =>
            Animated.timing(animatedValues[key], {
              toValue: value,
              duration: animationDuration,
              easing,
              useNativeDriver: false,
            })
          )
        ).start();
      } else {
        animate.forEach(([key, value]) => animatedValues[key].setValue(value));
      }

      setTooltipStyles(tooltip);
      setArrowStyles(arrow);
      setMaskRect({
        width: rect.width,
        height: rect.height,
        x: Math.floor(Math.max(rect.x, 0)),
        y: Math.floor(Math.max(rect.y, 0)),
      });
    },
    [
      androidStatusBarVisible,
      animatedValues,
      animationDuration,
      arrowColor,
      arrowSize,
      borderRadius,
      easing,
      isAnimated,
      layout,
      margin,
    ]
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

  const modalContent = (
    <View
      style={[
        defaultStyles.portalContainer,
        {
          paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={defaultStyles.container} pointerEvents="box-none">
        {contentVisible && maskRect && (
          <SvgMask
            size={{ x: maskRect.width, y: maskRect.height }}
            position={{ x: maskRect.x, y: maskRect.y }}
            canvasSize={{ x: layout.width, y: layout.height }}
            animated={animated}
            animationDuration={animationDuration}
            easing={easing}
            backdropColor={backdropColor}
            borderRadius={currentBorderRadius}
            maskShape={currentMaskShape}
            onClick={handleMaskClick}
          />
        )}

        {contentVisible && currentStep && (
          <>
            <Animated.View
              style={[
                defaultStyles.stepNumberContainer,
                {
                  left: animatedValues.stepNumberLeft,
                  top: Animated.add(
                    animatedValues.top,
                    -STEP_NUMBER_RADIUS
                  ) as unknown as number,
                },
              ]}
            >
              <StepNumberComponent
                currentStepNumber={currentStepNumber}
                totalStepsNumber={totalStepsNumber}
              />
            </Animated.View>

            {arrowSize > 0 && (
              <Animated.View
                style={[
                  defaultStyles.arrow,
                  { borderWidth: arrowSize },
                  arrowStyles,
                ]}
              />
            )}

            <Animated.View
              style={[defaultStyles.tooltip, tooltipStyles, tooltipStyle]}
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
            </Animated.View>
          </>
        )}
      </View>
    </View>
  );

  // Use Portal if available, otherwise render directly
  if (Portal) {
    return <Portal hostName={portalHostName}>{modalContent}</Portal>;
  }

  return modalContent;
});

/**
 * TourProvider - Wrap your app with this provider to enable tours
 */
export const TourProvider: React.FC<
  PropsWithChildren<TourProviderOptions & { portalHostName?: string }>
> = ({
  children,
  verticalOffset = 0,
  portalHostName = 'tour-pilot-portal',
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

      // Use step's highlightPadding if defined, otherwise use provider's default
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

      if (scrollViewRef.current && step?.wrapperRef.current) {
        await new Promise<void>((resolve) => {
          const wrapperRef = step.wrapperRef.current;
          if (!wrapperRef) {
            resolve();
            return;
          }
          wrapperRef.measureLayout(
            scrollViewRef.current as unknown as number,
            (_x, y, _w, h) => {
              const yOffset = y > 0 ? y - h / 2 : 0;
              scrollViewRef.current?.scrollTo({ y: yOffset, animated: false });

              // Wait multiple frames for scroll and layout to complete
              const waitFrames = (count: number) => {
                if (count === 0) {
                  // Add additional delay to ensure layout stability
                  setTimeout(() => resolve(), 100);
                  return;
                }
                requestAnimationFrame(() => waitFrames(count - 1));
              };
              waitFrames(4); // Wait 4 frames instead of 2
            },
            () => resolve()
          );
        });

        // Additional delay after scroll to ensure complete stability
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (move && step) {
        await moveModalToStep(step);
      }
    },
    [moveModalToStep]
  );

  const remeasureCurrentStep = useCallback(async () => {
    if (currentStep) {
      // Allow the layout pass to complete before re-measuring (onLayout fires mid-frame)
      await new Promise(resolve => setTimeout(resolve, 50));
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
        portalHostName={portalHostName}
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
    elevation: ZINDEX,
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
    ...(Platform.OS === 'android' && { elevation: 50 }),
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
