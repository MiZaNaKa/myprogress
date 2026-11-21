import { Children } from "react";
import {
    Platform,
    StyleSheet,
    Text,
    type TextProps,
    type TextStyle,
} from "react-native";

import { Fonts, ThemeColor } from "@/constants/theme";
import { useLanguage } from "@/context/LanguageProvider";
import { useTheme } from "@/hooks/use-theme";

export type ThemedTextProps = TextProps & {
  type?:
    | "default"
    | "title"
    | "small"
    | "smallBold"
    | "subtitle"
    | "link"
    | "linkPrimary"
    | "code";
  themeColor?: ThemeColor;
  translate?: boolean;
};

const FONT_SCALE = 0.94;

export function ThemedText({
  children,
  style,
  type = "default",
  themeColor,
  translate = true,
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const resolvedStyle: TextStyle =
    StyleSheet.flatten([styles[type], style]) ?? {};
  const scaledStyle = {
    ...resolvedStyle,
    fontSize:
      typeof resolvedStyle.fontSize === "number"
        ? Math.round(resolvedStyle.fontSize * FONT_SCALE)
        : resolvedStyle.fontSize,
    lineHeight:
      typeof resolvedStyle.lineHeight === "number"
        ? Math.round(resolvedStyle.lineHeight * FONT_SCALE)
        : resolvedStyle.lineHeight,
  };

  return (
    <Text
      style={[{ color: theme[themeColor ?? "text"] }, scaledStyle]}
      {...rest}
    >
      {Children.map(children, (child) =>
        translate && typeof child === "string" ? t(child) : child,
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: "#3c87f7",
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
