import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';

export default function Index() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <LinearGradient
      colors={["#2F2F2F", "#6A6A6A"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={{ flex: 1 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View
            style={{
              width: 200,
              height: 200,
              borderRadius: 32,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 16,
              elevation: 8,
              marginBottom: 40,
            }}
          >
            <Image
              source={require('@/assets/images/hippos_logo.png')}
              style={{ width: 160, height: 160 }}
              contentFit="contain"
            />
          </View>

          <View style={{ width: '100%', gap: 16 }}>
            <TextInput
              placeholder="USERNAME/EMAIL"
              placeholderTextColor="#BDBDBD"
              autoCapitalize="none"
              style={{
                width: '100%',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: '#E8E8E8',
                color: '#111',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              placeholder="PASSWORD"
              placeholderTextColor="#BDBDBD"
              secureTextEntry
              style={{
                width: '100%',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 12,
                backgroundColor: '#E8E8E8',
                color: '#111',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
              value={password}
              onChangeText={setPassword}
            />

            <TouchableOpacity
              onPress={() => router.push('/dashboard')}
              activeOpacity={0.85}
              style={{
                marginTop: 12,
                backgroundColor: '#F2B24D',
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <Text style={{ color: '#000', letterSpacing: 1, fontWeight: '700' }}>LOG IN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
