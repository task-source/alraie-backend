import axios from "axios";
import { Request, Response } from 'express';
import { getDayTypeFromWeatherId, getUvCategory } from "../utils/weatherUtils";
import { asyncHandler } from "../middleware/asyncHandler";
import createError from "http-errors";
import { getWeatherByLatLon } from "../services/weatherService";
import animalModel from "../models/animal.model";
import UserModel from '../models/user';

export const getHomepageWeather = asyncHandler(async (req: any, res: any) => {

    const { lat, lon, ownerId: ownerIdQuery } = req.query;
  
    if (!lat || !lon) {
      throw createError(400, req.t("LAT_LONG_REQ"));
    }
  
    // Fetch actor
    const actor = await UserModel.findById(req.user?.id);
    if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  
    // -------------------------------------
    // Resolve ownerId based on role
    // -------------------------------------
    let ownerId;
    if (actor.role === "owner") {
      ownerId = actor._id;
    } else if (actor.role === "assistant") {
      if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
      ownerId = actor.ownerId;
    } else if (actor.role === "admin" || actor.role === "superadmin") {
      if (!ownerIdQuery) throw createError(400, req.t("OWNER_ID_REQUIRED"));
      ownerId = ownerIdQuery;
    } else {
      throw createError(403, req.t("FORBIDDEN"));
    }
  
    // -------------------------------------
    // WEATHER API CALLS
    // -------------------------------------
  
    const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!WEATHER_API_KEY) throw createError(500, "Missing WEATHER_API_KEY");
  
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`;
    const uvUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`;
  
    const [weatherRes, uvRes] = await Promise.all([
      axios.get(url),
      axios.get(uvUrl).catch(() => ({ data: { value: null } })),
    ]);
  
    const w = weatherRes.data;
  
    const temp = w.main?.temp ?? null;
    const pressure = w.main?.pressure ?? null;
    const humidity = w.main?.humidity ?? null;
  
    const weatherCode = w.weather?.[0]?.id ?? null;
    const weatherMain = w.weather?.[0]?.main ?? "";
    const weatherDescription = w.weather?.[0]?.description ?? "";
    const dayType = weatherCode ? getDayTypeFromWeatherId(weatherCode) : "unknown";
  
    const uv = uvRes.data?.value ?? null;
    const uvCategory = uv !== null ? getUvCategory(uv) : null;
  
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
    const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  
    // -------------------------------------
    // ANIMAL + GPS STATS
    // -------------------------------------
  
    const baseFilter = { ownerId };
  
    const [totalAnimals, gpsLinked, gpsNotLinked] = await Promise.all([
      animalModel.countDocuments(baseFilter),
      animalModel.countDocuments({ ...baseFilter, gpsDeviceId: { $exists: true, $ne: null } }),
      animalModel.countDocuments({ ...baseFilter, $or: [{ gpsDeviceId: null }, { gpsDeviceId: { $exists: false } }] }),
    ]);
  
    // -------------------------------------
    // RESPONSE
    // -------------------------------------
  
    res.json({
      success: true,
      data: {
        // WEATHER DATA
        temperatureC: temp,
        pressureMb: pressure,
        humidityPercent: humidity,
        uvIndex: uv,
        uvCategory,
        date: dateStr,
        day: dayName,
        time: timeStr,
        weatherMain,
        weatherDescription,
        dayType,
  
        // ANIMAL STATS
        totalAnimals,
        gpsLinkedAnimals: gpsLinked,
        gpsNotLinkedAnimals: gpsNotLinked
      },
    });
  });

  export const getWeather = async (req: Request, res: Response) => {
    try {
      const { lat, lon } = req.query;
  
      if (!lat || !lon) {
        return res.status(400).json({ message:req.t("LAT_LONG_REQ") });
      }
  
      const weather = await getWeatherByLatLon(Number(lat), Number(lon));
  
      return res.json(weather);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  };
  