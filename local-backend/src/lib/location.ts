const mapLink = (latitude: number, longitude: number) => `https://www.google.com/maps?q=${latitude},${longitude}`;

export function locationMapLink(latitude: number | null | undefined, longitude: number | null | undefined) {
  return typeof latitude === "number" && Number.isFinite(latitude)
    && typeof longitude === "number" && Number.isFinite(longitude)
    ? mapLink(latitude, longitude)
    : null;
}

export async function reverseGeocode(latitude: number, longitude: number, fallback: string | null = null) {
  const link = mapLink(latitude, longitude);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1&accept-language=pt-BR`, {
      headers: { "User-Agent": "Mosaico-Food/1.0 (atendimento local)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    if (response.ok) {
      const data = await response.json() as { display_name?: unknown };
      if (typeof data.display_name === "string" && data.display_name.trim()) return data.display_name.trim();
    }
  } catch {
    // O link do mapa continua sendo um endereço utilizável quando a consulta
    // externa estiver indisponível ou a loja estiver sem internet.
  }
  return fallback?.trim() || link;
}
