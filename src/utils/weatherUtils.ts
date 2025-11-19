export const getDayTypeFromWeatherId = (id: number): string => {
  if (id >= 200 && id < 300) return "storm";
  if (id >= 300 && id < 400) return "drizzle";
  if (id >= 500 && id < 600) return id < 520 ? "rain" : "heavy_rain";
  if (id >= 600 && id < 700) return "snow";

  if (id === 701) return "mist";
  if (id === 711) return "smoke";
  if (id === 721) return "haze";
  if (id === 731 || id === 761 || id === 762) return "dust";
  if (id === 751) return "sand";
  if (id === 771) return "squall";
  if (id === 781) return "tornado";

  if (id === 800) return "clear";

  if (id === 801) return "partly_cloudy";
  if (id === 802 || id === 803 || id === 804) return "cloudy";

  return "unknown";
};


export const getUvCategory = (uv: number): string => {
    if (uv <= 2) return "low";
    if (uv <= 5) return "moderate";
    if (uv <= 7) return "high";
    if (uv <= 10) return "very_high";
    return "extreme";
  };
  