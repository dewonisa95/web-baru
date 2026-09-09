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
    // Website mengambil data sensor terakhir
    // ========================================================
    if (
      request.method === "GET" &&
      url.pathname === "/api/sensor"
    ) {
      const data =
        await this.ctx.storage.get("sensorData");

      const buzzer =
        await this.ctx.storage.get("buzzerEnabled");

      // Belum ada data sensor
      if (!data) {
        return jsonResponse({
          db: 0,
          warning: false,
          buzzer:
            buzzer !== undefined
              ? buzzer
              : true,
          device: null,
          timestamp: null,
          status: "waiting"
        });
      }

      // Data sensor tersedia
      return jsonResponse({
        ...data,
        buzzer:
          buzzer !== undefined
            ? buzzer
            : data.buzzer
      });
    }


    // ========================================================
    // POST /set-buzzer
    // Internal Worker → Durable Object
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
    // ESP32 mengirim data sensor
    // ========================================================
    if (
      request.method === "POST" &&
      url.pathname === "/api/sensor"
    ) {

      // ------------------------------------------------------
      // AMBIL API KEY DARI HEADER
      // ------------------------------------------------------
      const apiKey =
        request.headers.get("X-API-Key");


      // ------------------------------------------------------
      // VALIDASI API KEY
      //
      // PENTING:
      // Karena kita berada di dalam SensorState,
      // gunakan this.env.DEVICE_API_KEY
      // ------------------------------------------------------
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


      // ------------------------------------------------------
      // BACA JSON DARI ESP32
      // ------------------------------------------------------
      try {
        const body =
          await request.json();


        // ----------------------------------------------------
        // VALIDASI FORMAT
        // ----------------------------------------------------
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


        // ----------------------------------------------------
        // VALIDASI ARRAY READINGS
        // ----------------------------------------------------
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


        // ----------------------------------------------------
        // AMBIL READING TERAKHIR
        // ----------------------------------------------------
        const reading =
          body.readings[
            body.readings.length - 1
          ];


        // ----------------------------------------------------
        // AMBIL STATUS BUZZER TERAKHIR
        // DARI DURABLE OBJECT
        // ----------------------------------------------------
        const storedBuzzer =
          await this.ctx.storage.get(
            "buzzerEnabled"
          );


        // ----------------------------------------------------
        // BENTUK DATA SENSOR
        // ----------------------------------------------------
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
            new Date().toISOString()
        };


        // ----------------------------------------------------
        // SIMPAN DATA SENSOR
        // ----------------------------------------------------
        await this.ctx.storage.put(
          "sensorData",
          sensorData
        );


        // ----------------------------------------------------
        // KIRIM RESPONSE KE ESP32
        // ----------------------------------------------------
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
    // GET dan POST
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

      // ------------------------------------------------------
      // Hanya GET
      // ------------------------------------------------------
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


      // ------------------------------------------------------
      // AMBIL STATE BUZZER
      // ------------------------------------------------------
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


      // ------------------------------------------------------
      // DURABLE OBJECT
      // ------------------------------------------------------
      const id =
        env.SENSOR_STATE.idFromName(
          "esp-sound-01"
        );

      const stub =
        env.SENSOR_STATE.get(id);


      // ------------------------------------------------------
      // SIMPAN STATUS BUZZER
      // ------------------------------------------------------
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
