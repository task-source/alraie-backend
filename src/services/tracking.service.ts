// services/tracking.service.ts
import GpsDeviceModel from "../models/gps.model";
import AnimalModel from "../models/animal.model";
import GeoFenceModel from "../models/geofence.model";
import GpsLocationModel from "../models/gpsLocation.model";

import { fetchOwnerLandAirSeaDevices } from "./landAirSea.service";
import { haversineDistanceKm } from "../utils/geo";
import { createAlert, sendPushToUsers } from "./notification.service";
import { decrypt } from "../utils/crypto";

const OUT_OF_RANGE_ALERT = "Animal is out of geofence range";
const IN_SAFE_ZONE_TEMPLATE = (name: string) => `Returned to safe zone ${name}`;
const LOW_BATTERY_TEMPLATE = (battery: number) =>
  `Battery level is low  ${battery}% `;
const DEVICE_LED_OFF_MSG =
  "Device LED is off — could indicate GPS is turned off";
const DEVICE_IDLE_MSG = "Device might be off or idle";

type LoggerLike = {
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
  debug?: (...args: any[]) => void;
};

/**
 * Master tracking entrypoint
 * - Loads all GPS devices
 * - Runs processing for each device independently
 * - Parallel but protects server using Promise.allSettled
 */
export async function runTrackingPass(logger: LoggerLike = console) {
  try {
    const allGps = await GpsDeviceModel.find({}).lean();

    if (!allGps.length) {
      logger.info?.("[tracking] No GPS devices found.");
      return;
    }

    // Rate-safe parallel execution
    await Promise.allSettled(
      allGps.map((gps) =>
        processSingleGpsDevice(gps, logger).catch((err) => {
          logger.error?.(
            "[tracking] Device crashed:",
            gps.serialNumber,
            err
          );
        })
      )
    );

    logger.info?.(
      `[tracking] Completed pass for ${allGps.length} devices.`
    );
  } catch (err) {
    logger.error?.("[tracking] FATAL: tracking pass crashed", err);
  }
}

/**
 * Process tracking for **one GPS device**
 * - Uses its own LAS credentials
 * - Very important since each device may have different LAS accounts
 */
async function processSingleGpsDevice(gps: any, logger: LoggerLike) {
  const deviceId = String(gps.serialNumber);

  if (
    !gps.encryptedUsername ||
    !gps.encryptedPassword ||
    !gps.encryptedClientToken
  ) {
    logger.warn?.(
      "[tracking] Missing credentials for device",
      deviceId
    );
    return;
  }

  // decrypt credentials
  let username: string, password: string, clientToken: string;

  try {
    username = decrypt(gps.encryptedUsername);
    password = decrypt(gps.encryptedPassword);
    clientToken = decrypt(gps.encryptedClientToken);
  } catch (err) {
    logger.error?.(
      "[tracking] Credential decrypt failed",
      deviceId,
      err
    );
    return;
  }

  // Fetch devices under THIS credential
  const result = await fetchOwnerLandAirSeaDevices(
    username,
    password,
    clientToken,
    deviceId
  );

  if (!result.success || !result.devices) {
    logger.error?.(
      "[tracking] LAS fetch failed for",
      deviceId,
      result.error
    );
    return;
  }

  // Find its own device in LAS response
  const apiObj = result.devices.find(
    (d: any) => String(d.deviceId) === deviceId
  );

  if (!apiObj) {
    logger.warn?.(
      "[tracking] Device not found in LAS response",
      deviceId
    );
    return;
  }

  // Process tracking for this device
  await processGpsTrackingForAnimal(gps, apiObj, logger);
}

/**
 * Core logic for tracking, geofence, alerts, history etc.
 */
async function processGpsTrackingForAnimal(
  gps: any,
  apiObj: any,
  logger: LoggerLike
) {
  const deviceId = gps.serialNumber;

  // Parse coordinates
  const lat = Number(apiObj.latitude ?? apiObj.lat ?? apiObj.Latitude);
  const lon = Number(apiObj.longitude ?? apiObj.lon ?? apiObj.Longitude);

  if (!isFinite(lat) || !isFinite(lon)) {
    logger.warn?.("[tracking] Invalid coords", deviceId, apiObj);
    return;
  }

  const trackedAt = apiObj.lastlocation_time
    ? new Date(apiObj.lastlocation_time)
    : new Date();

  // Save GPS location
  await GpsLocationModel.create({
    gpsDeviceId: gps._id,
    serialNumber: deviceId,
    latitude: lat,
    longitude: lon,
    raw: apiObj,
    trackedAt,
  });

  // Update GPS device last known
  await GpsDeviceModel.updateOne(
    { _id: gps._id },
    {
      $set: {
        lastKnownLatitude: lat,
        lastKnownLongitude: lon,
        dataHash: apiObj,
        linkedAt: gps.linkedAt || new Date(),
      },
    }
  );

  // If linked to animal → do geofence + alerts
  if (!gps.animalId) return;

  const animal = await AnimalModel.findById(gps.animalId).lean();
  if (!animal) return;

  const geofences = await GeoFenceModel.find({
    animals: animal._id,
  }).lean();

  const geoFence = geofences?.[0];

  /** ─────────────────────────
   *  GEO-FENCE RANGE CHECKING
   *  ───────────────────────── */
  if (geoFence && geoFence.center) {
    const fenceLat = geoFence.center.lat;
    const fenceLon = geoFence.center.lng;
    const rangeKm = geoFence.radiusKm ?? 0;

    const distKm = haversineDistanceKm(lat, lon, fenceLat, fenceLon);

    if (distKm > rangeKm) {
      const msg = OUT_OF_RANGE_ALERT;
      await createAlert(animal.ownerId, animal._id, gps._id, msg, "ANIMAL_OUT");
      await sendPushToUsers(
        [String(animal.ownerId)],
        "Location Alert",
        msg,
        { animalId: String(animal._id) }
      );
    } else {
      const msg = IN_SAFE_ZONE_TEMPLATE(animal.name || "Animal");
      await createAlert(animal.ownerId, animal._id, gps._id, msg, "ANIMAL_IN");
    }
  }

  /** ─────────────────────────
   *  BATTERY / LED / IDLE LOGIC
   *  ───────────────────────── */

  // Battery
  if (apiObj.battery && Number(apiObj.battery) < 10) {
    const msg = LOW_BATTERY_TEMPLATE(Number(apiObj.battery));
    await createAlert(animal.ownerId, animal._id, gps._id, msg, "LOW_BATTERY");
  }

  // LED off
  if (apiObj.is_led_on === false || apiObj.isLedOn === false) {
    await createAlert(
      animal.ownerId,
      animal._id,
      gps._id,
      DEVICE_LED_OFF_MSG,
      "DEVICE_LED_OFF"
    );
  }

  // Idle detection
  if ((apiObj.speed_kmh === 0 || apiObj.speed === 0) && apiObj.lastlocation_time) {
    const last = new Date(apiObj.lastlocation_time);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    if (last < oneHourAgo) {
      await createAlert(
        animal.ownerId,
        animal._id,
        gps._id,
        DEVICE_IDLE_MSG,
        "DEVICE_IDLE"
      );
    }
  }
}
