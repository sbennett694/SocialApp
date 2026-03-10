import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export function useTemporaryHighlight(durationMs = 3200) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const emphasis = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;

  const triggerHighlight = useCallback((id: string) => {
    setHighlightedId(id);
  }, []);

  useEffect(() => {
    if (!highlightedId) {
      emphasis.stopAnimation();
      emphasis.setValue(0);
      flash.stopAnimation();
      flash.setValue(0);
      return;
    }

    emphasis.setValue(0);
    flash.setValue(0);

    // Snap-in: scale + translate settle
    const settleAnimation = Animated.timing(emphasis, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: false
    });

    // Glow aura: flash in → 2 slow pulses → fade out (non-native for shadow/bg)
    const flashIn = Animated.timing(flash, {
      toValue: 1,
      duration: 250,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false
    });
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.4, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(flash, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.sin), useNativeDriver: false })
      ]),
      { iterations: 2 }
    );
    const fadeOutGlow = Animated.timing(flash, {
      toValue: 0,
      duration: 700,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false
    });
    const fadeOutEmphasis = Animated.timing(emphasis, {
      toValue: 0,
      duration: 700,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false
    });

    const hold = Animated.delay(durationMs);
    const flashSequence = Animated.sequence([flashIn, pulse, hold, Animated.parallel([fadeOutGlow, fadeOutEmphasis])]);

    settleAnimation.start();
    flashSequence.start(({ finished }) => {
      if (finished) {
        setHighlightedId((current) => (current === highlightedId ? null : current));
      }
    });

    return () => {
      settleAnimation.stop();
      flash.stopAnimation();
      emphasis.setValue(0);
      flash.setValue(0);
    };
  }, [durationMs, highlightedId, emphasis, flash]);

  // Native-driver: scale + translate snap-in
  const emphasisAnimatedStyle = useMemo(
    () => ({
      transform: [
        { translateY: emphasis.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
        { scale: emphasis.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] }) }
      ],
      opacity: emphasis.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] })
    }),
    [emphasis]
  );

  // Non-native: amber glow (shadow + subtle bg tint), pulses with the flash value
  const glowAnimatedStyle = useMemo(
    () => ({
      shadowColor: "#f59e0b",
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
      shadowOpacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
      elevation: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
      backgroundColor: flash.interpolate({
        inputRange: [0, 1],
        outputRange: ["rgba(251, 191, 36, 0)", "rgba(251, 191, 36, 0.1)"]
      })
    }),
    [flash]
  );

  return { highlightedId, triggerHighlight, emphasisAnimatedStyle, glowAnimatedStyle };
}
