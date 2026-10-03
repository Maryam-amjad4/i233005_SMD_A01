/**
 * react-native replacement for the render harness: host component tags plus the
 * handful of primitives this project imports. Styles are returned untouched, so
 * a layout mistake is not detectable here — only a crash or a missing string is.
 */
export const View = 'View';
export const Text = 'Text';
export const Pressable = 'Pressable';
export const TouchableOpacity = 'TouchableOpacity';
export const TextInput = 'TextInput';
export const ScrollView = 'ScrollView';
export const FlatList = 'FlatList';
export const SafeAreaView = 'SafeAreaView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const RefreshControl = 'RefreshControl';
export const ActivityIndicator = 'ActivityIndicator';
export const Image = 'Image';
export const Modal = 'Modal';
export const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style || {}),
  absoluteFill: {},
  hairlineWidth: 1,
};
export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => {} }),
};
export const Platform = { OS: 'android', select: (spec) => (typeof spec === 'object' ? spec.android : spec) };
export const BackHandler = { addEventListener: () => ({ remove: () => {} }) };
export const Alert = { alert: () => {} };
export const Linking = { openURL: () => Promise.resolve() };
export const Keyboard = { dismiss: () => {} };
export const PixelRatio = { get: () => 3, roundToNearestPixel: (n) => n, getFontScale: () => 1 };
export const LayoutAnimation = { configureNext: () => {}, create: () => ({}) };
export const I18nManager = { isRTL: false };
export const Animated = { View: 'Animated.View', Text: 'Animated.Text', Value: class {}, timing: () => ({ start: (cb) => cb?.({ finished: true }) }), spring: () => ({ start: (cb) => cb?.({ finished: true }) }) };
export const useColorScheme = () => 'light';
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });
export const InteractionManager = { runAfterInteractions: (fn) => fn() };
export const AppState = { currentState: 'active', addEventListener: () => ({ remove: () => {} }) };
export const Appearance = { getColorScheme: () => 'light' };
