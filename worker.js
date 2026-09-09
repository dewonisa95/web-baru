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
    // TIDAK membutuhkan API key
    // ========================================================
    if (
      request.method === "GET" &&
      url.pathname === "/api/sensor"
    ) {
      const data =
        await this.ctx.storage.get("sensorData");

      const buzzer =
        await this.ctx.storage.get("buzzerEnabled");

      // Belum ada data dari ESP32
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

      // Data sudah tersedia
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
    // Digunakan secara internal oleh Worker
    // untuk menyimpan status buzzer
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
            error:
              "Data buzzer tidak valid"
          },
          400
        );
      }
    }


    // ========================================================
    // POST /api/sensor
    // ESP32 mengirim data sensor
    //
    // WAJIB menggunakan X-API-Key
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
      // Secret harus dibuat di Cloudflare dengan nama:
      //
      // DEVICE_API_KEY
      // ------------------------------------------------------
      if (
        !apiKey ||
        !env.DEVICE_API_KEY ||
        apiKey !== env.DEVICE_API_KEY
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
      // PROSES JSON
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
        // CEK READINGS
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
        // AMBIL DATA TERAKHIR
        // ----------------------------------------------------
        const reading =
          body.readings[
            body.readings.length - 1
          ];


        // ----------------------------------------------------
        // AMBIL STATUS BUZZER YANG TERAKHIR
        // DIKONTROL OLEH WEBSITE
        // ----------------------------------------------------
        const storedBuzzer =
          await this.ctx.storage.get(
            "buzzerEnabled"
          );


        // ----------------------------------------------------
        // SUSUN DATA SENSOR
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
        // SIMPAN KE DURABLE OBJECT
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
    // GET /api/sensor
    // POST /api/sensor
    // ========================================================
    if (
      url.pathname === "/api/sensor"
    ) {

      // ------------------------------------------------------
      // Pastikan Durable Object tersedia
      // ------------------------------------------------------
      const id =
        env.SENSOR_STATE.idFromName(
          "esp-sound-01"
        );


      const stub =
        env.SENSOR_STATE.get(id);


      return stub.fetch(request);
    }


    // ========================================================
    // /buzzer?state=on
    // /buzzer?state=off
    // ========================================================
    if (
      url.pathname === "/buzzer"
    ) {

      // ------------------------------------------------------
      // Hanya GET yang diperbolehkan
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
      // AMBIL PARAMETER STATE
      // ------------------------------------------------------
      const state =
        url.searchParams.get(
          "state"
        );


      // ------------------------------------------------------
      // VALIDASI STATE
      // ------------------------------------------------------
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
      // AMBIL DURABLE OBJECT
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
      const response =
        await stub.fetch(
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


      return response;
    }


    // ========================================================
    // STATIC ASSETS
    //
    // index.html
    // style.css
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
