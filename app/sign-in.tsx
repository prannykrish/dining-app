import { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { useSignIn, useSignUp, useOAuth } from "@clerk/clerk-expo";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

WebBrowser.maybeCompleteAuthSession();

type Mode = "sign-in" | "sign-up" | "verify";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/sign-in", { scheme: "dininghallapp" }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.back();
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!signInLoaded || loading) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setSignInActive({ session: result.createdSessionId });
        router.back();
      }
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.message || "Sign in failed";
      Alert.alert("Sign In Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUpLoaded || loading) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setMode("verify");
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.message || "Sign up failed";
      Alert.alert("Sign Up Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUpLoaded || loading) return;
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setSignUpActive({ session: result.createdSessionId });
        router.back();
      }
    } catch (err: any) {
      const msg = err.errors?.[0]?.longMessage || err.message || "Verification failed";
      Alert.alert("Verification Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Email verification step */}
          {mode === "verify" ? (
            <>
              <ThemedText style={styles.heading}>Check your email</ThemedText>
              <ThemedText style={styles.sub}>
                We sent a code to {email}. Enter it below.
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Verification code"
                placeholderTextColor="#888"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoFocus
              />
              <Pressable style={styles.primaryBtn} onPress={handleVerify} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryBtnText}>Verify</ThemedText>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.heading}>
                {mode === "sign-in" ? "Sign in to review" : "Create an account"}
              </ThemedText>

              {/* Google OAuth */}
              <Pressable style={styles.googleBtn} onPress={handleGoogleSignIn} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#444" />
                ) : (
                  <ThemedText style={styles.googleBtnText}>Continue with Google</ThemedText>
                )}
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <ThemedText style={styles.dividerText}>or</ThemedText>
                <View style={styles.dividerLine} />
              </View>

              {/* Email + password */}
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              <Pressable
                style={styles.primaryBtn}
                onPress={mode === "sign-in" ? handleEmailSignIn : handleSignUp}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.primaryBtnText}>
                    {mode === "sign-in" ? "Sign In" : "Create Account"}
                  </ThemedText>
                )}
              </Pressable>

              <Pressable
                onPress={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
                style={styles.switchRow}
              >
                <ThemedText style={styles.switchText}>
                  {mode === "sign-in"
                    ? "No account? Create one"
                    : "Already have an account? Sign in"}
                </ThemedText>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kav: { flex: 1 },
  container: { padding: 24, paddingTop: 32, gap: 14 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 4 },
  sub: { opacity: 0.6, fontSize: 14, marginBottom: 8 },
  googleBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  googleBtnText: { color: "#333", fontWeight: "600", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(128,128,128,0.25)" },
  dividerText: { fontSize: 12, opacity: 0.4 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#ccc",
  },
  primaryBtn: {
    backgroundColor: "#500000",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  switchRow: { alignItems: "center", paddingVertical: 4 },
  switchText: { fontSize: 13, opacity: 0.55 },
});
