import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type as t } from '../lib/theme';

interface Toast { text: string; action?: { label: string; onPress: () => void } }
const Ctx = createContext<(toast: Toast) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((next: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
    }, next.action ? 5000 : 2600);
  }, [anim]);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 76, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}
        >
          <View style={{ backgroundColor: '#1C1915', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[t.small, { color: '#F6F0E6', flex: 1 }]}>{toast.text}</Text>
            {toast.action ? (
              <Pressable accessibilityRole="button" onPress={() => { toast.action?.onPress(); setToast(null); }} hitSlop={10}>
                <Text style={[t.small, { color: '#F0B429', fontWeight: '800' }]}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
