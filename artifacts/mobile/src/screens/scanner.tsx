import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Pressable, Text, View } from "react-native";
import { apiFetch } from "../lib/api";
import { colors, money } from "../lib/theme";
import { describeError } from "../lib/errors";
import { Button, Card, Screen, State } from "../components/ui";

interface Lookup {
  productId: string;
  name: string;
  category: string;
  baseUnit: string;
  stock: number | null;
  stockUnit: string | null;
  sellingUnit: {
    id: string;
    name: string;
    conversionFactor: number;
    sellingPrice: number;
  } | null;
}

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [last, setLast] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: (barcode: string) => apiFetch<Lookup>(`/products/barcodes/${barcode}`),
    onSuccess: (data) => {
      setLast(data);
      setError(null);
    },
    onError: (e: unknown) => {
      setLast(null);
      // The raw error carries HTTP status text, so it is resolved to something
      // a person can read.
      setError(
        `${describeError(e).detail} An authorized user can register this barcode.`,
      );
    },
  });

  if (!permission) {
    return (
      <Screen title="Scanner" eyebrow="Camera">
        <State loading />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen title="Scanner" eyebrow="Camera">
        <Card style={{ gap: 12 }}>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>Camera access needed</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Dunda uses the phone camera to read product barcodes. Nothing is recorded or
            uploaded — the code is only looked up against your catalog.
          </Text>
          <Button label="Allow camera" onPress={requestPermission} />
        </Card>
      </Screen>
    );
  }

  function onScan(result: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    lookup.mutate(result.data);
    setTimeout(() => setScanned(false), 1500);
  }

  return (
    <Screen title="Scanner" eyebrow="Barcode">
      <View style={{ flex: 1, gap: 14 }}>
        <View
          style={{
            flex: 1,
            minHeight: 320,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: colors.inkSoft,
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: [
                "ean13",
                "ean8",
                "upc_a",
                "upc_e",
                "code128",
                "code39",
                "itf14",
              ],
            }}
            onBarcodeScanned={onScan}
          />
        </View>

        {lookup.isPending ? <State loading /> : null}

        {error ? (
          <Card style={{ backgroundColor: colors.redSoft, borderColor: colors.red }}>
            <Text style={{ fontWeight: "700", color: colors.red }}>Product not found</Text>
            <Text style={{ color: colors.red, marginTop: 4, fontSize: 13 }}>{error}</Text>
          </Card>
        ) : null}

        {last ? (
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 20, fontWeight: "800", flex: 1 }}>{last.name}</Text>
              <Text style={{ color: "#b65332", fontWeight: "800" }}>
                {money(last.sellingUnit?.sellingPrice ?? 0)}
              </Text>
            </View>
            <Text style={{ color: colors.mutedSoft, fontSize: 12 }}>
              {last.category} ·{" "}
              {last.stock !== null
                ? `${last.stock} ${last.stockUnit} in stock`
                : "not tracked"}
            </Text>
            {last.sellingUnit ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Default unit: {last.sellingUnit.name} · deducts{" "}
                {last.sellingUnit.conversionFactor} {last.baseUnit}
              </Text>
            ) : null}
            <Text style={{ color: colors.mutedSoft, fontSize: 12 }}>
              Open the Order screen to add it to a tab.
            </Text>
          </Card>
        ) : null}

        <Pressable onPress={() => lookup.reset()}>
          <Text style={{ color: colors.muted, textAlign: "center", fontSize: 12 }}>
            Tap to clear and scan again
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
