import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { translateText } from '../i18n/telugu';

/**
 * Drop-in replacement for react-native's Text that translates plain string
 * children when Telugu is selected. Nested <Text> nodes are translated
 * individually; non-string children (numbers, JSX) pass through untouched.
 */
export function Text({ children, ...rest }: TextProps) {
  const lang = useAppStore((s) => s.lang);
  const content = typeof children === 'string' ? translateText(lang, children) : children;
  return <RNText {...rest}>{content}</RNText>;
}
