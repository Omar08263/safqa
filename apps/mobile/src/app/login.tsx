import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useMobileSession } from '../lib/session';
import { Screen, useT } from '../lib/ui';

export default function LoginScreen() {
  const { login } = useMobileSession();
  const { t } = useT();
  const router = useRouter();
  const [email, setEmail] = useState('demo@safqa.app');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen>
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{t('action.login')}</Text>
      <Text style={{ marginBottom: 12, color: '#6e665b' }}>demo@safqa.app / demo1234</Text>
      <View style={{ gap: 8 }}>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" style={field} />
        <TextInput value={password} onChangeText={setPassword} secureTextEntry style={field} />
        {error ? <Text style={{ color: '#b8432f' }}>{error}</Text> : null}
        <Pressable
          onPress={() => {
            void login(email, password)
              .then(() => router.back())
              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t('auth.invalid')));
          }}
          style={{ backgroundColor: '#c9840a', borderRadius: 999, padding: 12, alignItems: 'center' }}
        >
          <Text style={{ fontWeight: '700' }}>{t('action.login')}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const field = {
  backgroundColor: '#fffaf3',
  borderWidth: 1,
  borderColor: '#e4d8c6',
  borderRadius: 12,
  padding: 12,
};
