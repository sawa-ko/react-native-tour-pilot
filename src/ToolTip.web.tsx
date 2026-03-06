import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TooltipProps } from './types';

export const DefaultTooltip: React.FC<TooltipProps> = ({
  currentStep,
  currentStepNumber,
  totalStepsNumber,
  isFirstStep,
  isLastStep,
  goToNext,
  goToPrev,
  stop,
}) => {
  const parseContent = (text?: string) => {
    const parts = text?.split('||') || [];
    if (parts.length >= 2) {
      return { title: parts[0]?.trim(), body: parts[1]?.trim() };
    }
    return { title: text || '', body: '' };
  };

  const { title, body } = parseContent(currentStep?.text);

  const handleBack = () => {
    if (isFirstStep) stop();
    else goToPrev();
  };

  const handleNext = () => {
    if (isLastStep) stop();
    else goToNext();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>

      <View style={styles.navigation}>
        <Pressable
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.navButtonPressed,
          ]}
        >
          <Text style={styles.navButtonText}>
            {isFirstStep ? 'Skip' : 'Back'}
          </Text>
        </Pressable>

        <Text style={styles.stepIndicator}>
          {currentStepNumber}/{totalStepsNumber}
        </Text>

        <Pressable
          onPress={handleNext}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.navButtonPressed,
          ]}
        >
          <Text style={styles.navButtonText}>
            {isLastStep ? 'Done' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#202020',
    borderRadius: 12,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    maxWidth: 320,
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  content: { marginBottom: 16 },
  title: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  body: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, lineHeight: 20 },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    minWidth: 50,
  },
  navButtonPressed: { backgroundColor: 'rgba(255, 255, 255, 0.1)' },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  stepIndicator: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    fontWeight: '400',
  },
});

export default DefaultTooltip;
