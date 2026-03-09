import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export function useTemporaryHighlight(durationMs = 1800) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const emphasis = useRef(new Animated.Value(0)).current;

  const triggerHighlight = useCallback((id: string) => {
    setHighlightedId(id);
  }, []);

  useEffect(() => {
    if (!highlightedId) {
      emphasis.stopAnimation();
      emphasis.setValue(0);
      return;
    }

    emphasis.setValue(0);
    const settleAnimation = Animated.timing(emphasis, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true
    });

    settleAnimation.start();

    const timeout = setTimeout(() => {
      setHighlightedId(null);
    }, durationMs);

    return () => {
      clearTimeout(timeout);
      settleAnimation.stop();
      emphasis.setValue(0);
    };
  }, [durationMs, highlightedId, emphasis]);

  const emphasisAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: emphasis.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 0]
          })
        },
        {
          scale: emphasis.interpolate({
            inputRange: [0, 1],
            outputRange: [0.992, 1]
          })
        }
      ],
      opacity: emphasis.interpolate({
        inputRange: [0, 1],
        outputRange: [0.975, 1]
      })
    }),
    [emphasis]
  );

  return { highlightedId, triggerHighlight, emphasisAnimatedStyle };
}
