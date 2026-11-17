import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ReceiptResult = {
  shop_name: string | null;
  date: string | null;
  total_amount: number | null;
  currency: string | null;
};

type FieldProps = {
  label: string;
  value: string | null;
  big?: boolean;
};

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MODEL = "gemini-3.8-flash";

const PROMPT = `You are a receipt reader. Look at this receipt image and return ONLY JSON:
{"shop_name": string|null, "date": "YYYY-MM-DD"|null, "total_amount": number|null, "currency": string|null}
Use null for anything you cannot find. total_amount is the final amount paid.`;

async function extractReceipt(base64: string): Promise<ReceiptResult> {
  if (!API_KEY) {
    throw new Error("Gemini API key is missing. Check your .env file.");
  }

  if (!base64) {
    throw new Error("Receipt image data is missing.");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 90000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 256,
          },
        }),
        signal: controller.signal,
      },
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error?.message || `Gemini API error: ${res.status}`,
      );
    }

    const responseText = data?.candidates?.[0]?.content?.parts?.find(
      (part: any) => part.text,
    )?.text;

    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    return JSON.parse(responseText);
  } catch (error: any) {
    if (controller.signal.aborted) {
      throw new Error("Gemini took longer than 90 seconds. Please try again.");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "Network connection failed. Check your internet and try again.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const handleImage = async (picked: ImagePicker.ImagePickerResult) => {
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset.base64) {
      Alert.alert("Error", "Could not read image data. Please try again.");
      return;
    }
    setImage(asset.uri);
    setResult(null);
    setLoading(true);
    try {
      setResult(await extractReceipt(asset.base64));
    } catch (e: any) {
      Alert.alert(
        "Could not read receipt",
        e.message || "Something went wrong.",
      );
      setLoading(false);
    }
  };

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera permission is needed");
    handleImage(
      await ImagePicker.launchCameraAsync({ quality: 1, base64: true }),
    );
  };

  const openGallery = async () => {
    handleImage(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        base64: true,
      }),
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.title}>Receipt Scanner</Text>
        <Text style={s.subtitle}>
          Scan a receipt and let AI read it for you
        </Text>

        <View style={s.row}>
          <TouchableOpacity style={[s.btn, s.primary]} onPress={openCamera}>
            <Text style={s.btnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.secondary]} onPress={openGallery}>
            <Text style={[s.btnText, { color: "#4F46E5" }]}>🖼️ Gallery</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <Image
            source={{ uri: image }}
            style={s.preview}
            resizeMode="contain"
          />
        )}

        {loading && (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={s.muted}>Reading your receipt…</Text>
          </View>
        )}

        {result && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Extracted Details</Text>
            <Field label="Shop Name" value={result.shop_name} />
            <Field label="Date" value={result.date} />
            <Field
              label="Total Amount"
              value={
                result.total_amount != null
                  ? `${result.currency ?? ""} ${result.total_amount}`.trim()
                  : null
              }
              big
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Field = ({ label, value, big }: FieldProps) => (
  <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <Text style={[s.value, big && s.big]}>{value ?? "Not found"}</Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F6FA" },
  container: { padding: 20, paddingTop: 40 },
  title: { fontSize: 30, fontWeight: "800", color: "#1F2937" },
  subtitle: { fontSize: 15, color: "#6B7280", marginBottom: 24, marginTop: 4 },
  row: { flexDirection: "row", gap: 12 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  primary: { backgroundColor: "#4F46E5" },
  secondary: { backgroundColor: "#E0E7FF" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  preview: {
    width: "100%",
    height: 260,
    borderRadius: 14,
    marginTop: 20,
    backgroundColor: "#E5E7EB",
  },
  center: { alignItems: "center", marginTop: 24 },
  muted: { color: "#6B7280", marginTop: 8 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
    color: "#1F2937",
  },
  field: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  label: {
    fontSize: 12,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  value: { fontSize: 18, color: "#111827", fontWeight: "600", marginTop: 2 },
  big: { fontSize: 26, color: "#059669", fontWeight: "800" },
});
