// ============================================================
// DURABLE OBJECT: SENSOR STATE
// ============================================================
export class SensorState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ========================================================
    // GET /api/sensor
    // Website mengambil data terakhir dari ESP32
    // ========================================================
    if (
      request.method === "GET" &&
      url.pathname === "/api/sensor"
    ) {
      const data =
        await this.ctx.storage.get("sensorData");

      const buzzer =
        await this.ctx.storage.get("buzzerEnabled");

      // Belum pernah menerima data ESP32
      if (!data) {
        return jsonResponse({
          online: false,
          db: 0,
          warning: false,
          buzzer: false,
          device: null,
          timestamp: null,
          status: "offline"
        });
      }

      // ======================================================
      // BATAS WAKTU ESP32 DIANGGAP ONLINE
      // ESP32 mengirim setiap 500 ms.
      // Jika >3 detik tidak ada data → OFFLINE.
      // ======================================================
      const OFFLINE_TIMEOUT = 3000;

      const lastSeen =
        Number(data.lastSeen || 0);

      const online =
        lastSeen > 0 &&
        (Date.now() - lastSeen) <= OFFLINE_TIMEOUT;


      // ======================================================
      // ESP32 OFFLINE
      // ======================================================
      if (!online) {
        return jsonResponse({
          online: false,
          db: 0,
          warning: false,
          buzzer: false,
          device: data.device || null,
          timestamp: data.timestamp || null,
          status: "offline"
        });
      }


      // ======================================================
      // ESP32 ONLINE
      // ======================================================
      return jsonResponse({
        ...data,
        online: true,
        buzzer:
          buzzer !== undefined
            ? buzzer
            : data.buzzer
      });
    }


    // ========================================================
    // INTERNAL: SET BUZZER
    // ========================================================
    if (
      request.method === "POST" &&
      url.pathname === "/set-buzzer"
    ) {
      try {
        const body =
          await request.json();

        const enabled =
          body.buzzer === true;

        await this.ctx.storage.put(
          "buzzerEnabled",
          enabled
        );

        return jsonResponse({
          success: true,
          buzzer: enabled
        });

      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: "Data buzzer tidak valid"
          },
          400
        );
      }
    }


    // ========================================================
    // POST /api/sensor
    // ESP32 mengirim data
    // ========================================================
    if (
      request.method === "POST" &&
      url.pathname === "/api/sensor"
    ) {

      // ======================================================
      // API KEY
      // ======================================================
      const apiKey =
        request.headers.get("X-API-Key");

      if (
        !apiKey ||
        !this.env.DEVICE_API_KEY ||
        apiKey !== this.env.DEVICE_API_KEY
      ) {
        return jsonResponse(
          {
            success: false,
            error: "Unauthorized"
          },
          401
        );
      }


      // ======================================================
      // BACA JSON
      // ======================================================
      try {
        const body =
          await request.json();


        // ====================================================
        // VALIDASI
        // ====================================================
        if (
          !body.device ||
          !Array.isArray(body.readings)
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "Format data tidak valid"
            },
            400
          );
        }


        if (
          body.readings.length === 0
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "Readings kosong"
            },
            400
          );
        }


        // ====================================================
        // AMBIL DATA TERAKHIR
        // ====================================================
        const reading =
          body.readings[
            body.readings.length - 1
          ];


        // ====================================================
        // STATUS BUZZER DARI WEBSITE
        // ====================================================
        const storedBuzzer =
          await this.ctx.storage.get(
            "buzzerEnabled"
          );


        // ====================================================
        // SIMPAN DATA SENSOR
        // ====================================================
        const sensorData = {
          db:
            Number(reading.db) || 0,

          warning:
            reading.warning === true,

          buzzer:
            storedBuzzer !== undefined
              ? storedBuzzer
              : reading.buzzer !== false,

          device:
            body.device,

          timestamp:
            reading.t ||
            new Date().toISOString(),

          // WAKTU SEBENARNYA DATA DITERIMA WORKER
          lastSeen:
            Date.now()
        };


        // ====================================================
        // SIMPAN
        // ====================================================
        await this.ctx.storage.put(
          "sensorData",
          sensorData
        );


        // ====================================================
        // RESPONSE KE ESP32
        // ====================================================
        return jsonResponse({
          success: true,
          message:
            "Data sensor diterima",
          buzzer:
            sensorData.buzzer
        });

      } catch (error) {

        return jsonResponse(
          {
            success: false,
            error:
              "JSON tidak valid"
          },
          400
        );
      }
    }


    // ========================================================
    // ENDPOINT TIDAK DITEMUKAN
    // ========================================================
    return jsonResponse(
      {
        error:
          "Endpoint tidak ditemukan"
      },
      404
    );
  }
}


// ============================================================
// WORKER UTAMA
// ============================================================
export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    // ========================================================
    // API SENSOR
    // ========================================================
    if (
      url.pathname === "/api/sensor"
    ) {

      const id =
        env.SENSOR_STATE.idFromName(
          "esp-sound-01"
        );

      const stub =
        env.SENSOR_STATE.get(id);

      return stub.fetch(request);
    }


    // ========================================================
    // API BUZZER
    // ========================================================
    if (
      url.pathname === "/buzzer"
    ) {

      if (
        request.method !== "GET"
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Method tidak diizinkan"
          },
          405
        );
      }


      const state =
        url.searchParams.get(
          "state"
        );


      if (
        state !== "on" &&
        state !== "off"
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "state harus on atau off"
          },
          400
        );
      }


      const id =
        env.SENSOR_STATE.idFromName(
          "esp-sound-01"
        );

      const stub =
        env.SENSOR_STATE.get(id);


      return stub.fetch(
        new Request(
          "https://internal/set-buzzer",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                buzzer:
                  state === "on"
              })
          }
        )
      );
    }


    // ========================================================
    // STATIC ASSETS
    // ========================================================
    return env.ASSETS.fetch(
      request
    );
  }
};


// ============================================================
// JSON RESPONSE
// ============================================================
function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store",

        "Access-Control-Allow-Origin":
          "*"
      }
    }
  );
}
