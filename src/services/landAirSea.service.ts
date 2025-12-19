// services/landAirSea.service.ts
import axios from "axios";

export interface LandAirSeaDevice {
  deviceId: string;
  latitude?: number;
  longitude?: number;
  battery?: number;
  lastlocation?: string;
  lastlocation_time?: string | number;
  speed_kmh?: number;
  speed?: number;
  is_led_on?: boolean;
  isLedOn?: boolean;
  [k: string]: any;
}

export async function fetchOwnerLandAirSeaDevices(
  username: string,
  password: string,
  clientToken: string,
  deviceId: string
): Promise<{ success: boolean; devices?: LandAirSeaDevice[]; error?: any }> {
  const url = "https://gateway.landairsea.com/Track/MyDevices";

  try {
    const resp = await axios.post(
      url,
      {
        username,
        password,
        clientToken,
        filter: deviceId,
      },
      {
        timeout: 15000,
      }
    );

    const data = resp.data;
    if (!data || !data.message || data.message.result !== true) {
      return { success: false, error: data };
    }

    const devices = Array.isArray(data.devicedetails) ? data.devicedetails : [];
    return { success: true, devices };
  } catch (err: any) {
    return { success: false, error: err.message || err };
  }
}
