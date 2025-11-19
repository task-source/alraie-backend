import axios from "axios";

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY; // or paste directly
const BASE_URL = "https://api.openweathermap.org/data/2.5/weather";

export const getWeatherByLatLon = async (lat: number, lon: number) => {
  try {
    const response = await axios.get(BASE_URL, {
      params: {
        lat,
        lon,
        appid: OPENWEATHER_API_KEY,
        units: "metric", // change to 'imperial' if needed
      },
    });

    return response.data;
  } catch (error: any) {
    console.error("OpenWeather Error:", error.response?.data || error.message);
    throw new Error("Failed to fetch weather data");
  }
};
