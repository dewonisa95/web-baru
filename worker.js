export class SensorState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ================================================
    // GET DATA SENSOR
    // ================================================
    if (
      request.method === "GET" &&
      url.pathname === "/api/sensor"
    ) {
      const data =
        await this.ctx.storage.get("sensorData");

      const buzzer =
        await this.ctx.storage.get("buzzerEnabled");

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

      return jsonResponse({
        ...data,
        buzzer:
          buzzer !== undefined
            ? buzzer
            : data.buzzer
      });
    }


    // ================================================
    // SET BUZZER INTERNAL
    // ================================================
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


    // ================================================
    // POST DATA DARI ESP32
    // ================================================
    if (
      request.method === "POST" &&
      url.pathname === "/api/sensor"
    ) {
      try {
        const body =
          await request.json();

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


        const reading =
          body.readings[
            body.readings.length - 1
          ];


        // Ambil status buzzer yang dikendalikan website
        const storedBuzzer =
          await this.ctx.storage.get(
            "buzzerEnabled"
          );


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


        await this.ctx.storage.put(
          "sensorData",
          sensorData
        );


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


    return jsonResponse(
      {
        error:
          "Endpoint tidak ditemukan"
      },
      404
    );
  }
}


// ====================================================
// WORKER UTAMA
// ====================================================
export default {
  async fetch(request, env) {

    const url =
      new URL(request.url);


    // ================================================
    // API SENSOR
    // ================================================
    if (
      url.pathname ===
      "/api/sensor"
    ) {

      const id =
        env.SENSOR_STATE.idFromName(
          "esp-sound-01"
        );

      const stub =
        env.SENSOR_STATE.get(id);

      return stub.fetch(request);
    }


    // ================================================
    // API BUZZER
    // ================================================
    if (
      url.pathname === "/buzzer"
    ) {

      if (
        request.method !== "GET"
      ) {
        return jsonResponse(
          {
            error:
              "Method tidak diizinkan"
          },
          405
        );
      }


      const url =
        new URL(request.url);

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


    // ================================================
    // STATIC HTML/CSS
    // ================================================
    return env.ASSETS.fetch(
      request
    );
  }
};


// ====================================================
// JSON RESPONSE
// ====================================================
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
